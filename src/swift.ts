import * as fs from 'fs'
import { LogLevel, print, Webber } from './webber'
import { projectDirectory } from './extension'
import { isString } from './helpers/isString'

export class Swift {
    constructor(private webber: Webber) {}

    private async execute(args: string[]): Promise<string> {
        var env = process.env
        env.WEBBER = 'TRUE'
        const result = await this.webber.bash.execute({
            path: this.webber.toolchain.swiftPath,
            description: `get executable target`,
            cwd: projectDirectory,
            env: env
        }, args)
        if (result.stderr.length > 0)
            throw result.stderr
        return result.stdout
    }

    async getTargets(): Promise<SwiftTargets> {
        print(`Going to retrieve swift targets`, LogLevel.Verbose)
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            var result: SwiftTargets = {
                executables: [],
                serviceWorkers: []
            }
            const dump = await this.execute(['package', 'dump-package'])
            const json = JSON.parse(dump)
            if (json.products.length > 0) {
                for (let target of json.targets) {
                    if (target.type == 'executable')
                        result.executables.push(target.name)
                    if (target.dependencies.filter((d:any) => d.product.includes('ServiceWorker')).length > 0) {
                        result.serviceWorkers.push(target.name)
                    }
                }
            }
            print(`Retrieved targets: [${result.executables.join(', ')}]`, LogLevel.Verbose)
            return result
        } catch (error: any) {
            console.dir({getTargetsError: error})
            throw `Unable to get executable targets from the package dump`
        }
    }

    async packageDump(): Promise<PackageContent | undefined> {
        const args: string[] = ['package', 'dump-package']
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            const result = await this.execute(args)
            const json = JSON.parse(result)
            const dependencies: Dependency[] = json.dependencies
            const products: Product[] = json.products.map((x:any) => {
                var p: Product = x
                p.executable = x.type.hasOwnProperty('executable')
                return p
            })
            const targets: Target[] = json.targets
            return {
                dependencies: dependencies,
                products: products,
                targets: targets
            }
        } catch (error: any) {
            return undefined
        }
    }

    async grabPWAManifest(options: { serviceWorkerTarget: string }): Promise<any> {
        const executablePath = `${projectDirectory}/.build/.${SwiftBuildType.Native}/debug/${options.serviceWorkerTarget}`
        if (!fs.existsSync(executablePath)) {
            throw `Missing executable binary of the service target, can't retrieve manifest`
        }
        try {
            const result = await this.webber.bash.execute({
                path: executablePath,
                description: `grabbing PWA manifest`,
                cwd: projectDirectory
            }, [])
            return JSON.parse(result.stdout)
        } catch (error: any) {
            console.dir({grabServiceWorkerManifestError: error})
            throw `Unable to grab service worker manifest`
        }
    }

    async grabIndex(options: { target: string }): Promise<Index | undefined> {
        const executablePath = `${projectDirectory}/.build/.${SwiftBuildType.Native}/debug/${options.target}`
        if (!fs.existsSync(executablePath)) {
            throw `Missing executable binary of the ${options.target} target, can't retrieve index data`
        }
        try {
            const result = await this.webber.bash.execute({
                path: executablePath,
                description: `grabbing Index`,
                cwd: projectDirectory
            }, ['--index'])
            const startCode = '==INDEX-START=='
            const endCode = '==INDEX-END=='
            const stdout = result.stdout
            print(`stdout: ${stdout}`, LogLevel.Unbearable)
            if (stdout.includes(startCode) && stdout.includes(endCode)) {
                const json = stdout.split(startCode)[1].split(endCode)[0]
                return JSON.parse(json)
            } else {
                return undefined
            }
        } catch (error: any) {
            console.dir({grabServiceWorkerManifestError: error})
            throw `Unable to grab service worker manifest`
        }
    }

    async packageResolve(type: SwiftBuildType): Promise<void> {
        const args: string[] = ['package', 'resolve', "--build-path", `./.build/.${type}`]
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            const result = await this.webber.bash.execute({
                path: this.webber.toolchain.swiftPath,
                description: `resolving dependencies for ${type}`,
                cwd: projectDirectory
            }, args)
            if (result.code != 0) {
                if (result.stderr.length > 0) {
                    console.error({packageResolve: result.stderr})
                }
                throw `Unable to resolve swift packages for ${type}`
            }
        } catch (error: any) {
            print(`error: ${isString(error) ? error : JSON.stringify(error)}`, LogLevel.Normal, true)
            throw `Unable to resolve swift packages for ${type}`
        }
    }

    async version(): Promise<string | undefined> {
        const args: string[] = ['--version']
        try {
            return await this.execute(args)
        } catch (error: any) {
            return undefined
        }
    }

    async previews(moduleName: string, previewNames: string[]): Promise<Preview[] | undefined> {
        const args: string[] = ['run', '-Xswiftc', '-DWEBPREVIEW', moduleName, '--previews', ...previewNames.map((x) => `${moduleName}/${x}`), '--build-path', `./.build/.${SwiftBuildType.Native}`]
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            const result = await this.execute(args)
            const json: any = JSON.parse(result)
            return json.previews
        } catch (error: any) {
            return undefined
        }
    }

    async splash(productName: string) {
        const args: string[] = ['run', '-Xswiftc', '-DWEBSPLASH', '-Xswiftc', '-DWEBPREVIEW', productName, '--build-path', `./.build/.${SwiftBuildType.Native}`]
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            const splashDelimiter = "==SPLASH=="
            const str: string = await this.execute(args)
            const components = str.split(splashDelimiter)
            if (components.length == 0)
                return undefined
            const b64 = components[components.length-1]
            const buf = Buffer.from(b64, 'base64')
            return buf.toString()
        } catch (error: any) {
            return undefined
        }
    }

    async build(options: { type: SwiftBuildType, targetName: string, release: boolean, progressHandler?: (p: string) => void }) {
        print(`\`swift build\` started`, LogLevel.Verbose)
        var args: string[] = [
            'build',
            '-c', options.release ? 'release' : 'debug',
            '--product', options.targetName,
            '--build-path', `./.build/.${options.type}`
        ]
        if (options.type == SwiftBuildType.Wasi) {
            args = [...args,
                '--enable-test-discovery',
                '--static-swift-stdlib',
                '--triple', 'wasm32-unknown-wasi',
                '-Xswiftc', '-DJAVASCRIPTKIT_WITHOUT_WEAKREFS',
                '-Xswiftc', '-Xclang-linker',
                '-Xswiftc', '-mexec-model=reactor',
                '-Xlinker', '-lCoreFoundation',
                '-Xlinker', '-licuuc',
                '-Xlinker', '-licui18n',
                '-Xlinker', '--stack-first',
                '-Xlinker', '--export=main'
            ]
        }
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `Missing Package.swift file`
        }
        var env = process.env
        try {
            print(`🧰 ${this.webber.toolchain.swiftPath} ${args.join(' ')}`, LogLevel.Verbose)
            const result = await this.webber.bash.execute({
                path: this.webber.toolchain.swiftPath,
                description: `Building swift`,
                cwd: projectDirectory,
                env: env,
                processInstanceHandler: (process) => {
                    if (!options.progressHandler) return
                    process.stdout.on('data', function(msg) {
                        const m = msg.toString()
                        if (m.startsWith('[')) {
                            options.progressHandler!(m.split(']')[0].replace('[', ''))
                        }
                    })
                }
            }, args)
        } catch (error: any) {
            const rawError: string = error.stdout
            if (rawError.length == 0) {
                var errString: string = error.stderr
                if (errString.length > 0) {
                    const separator = ': error:'
                    errString = errString.includes(separator) ? errString.split(separator).pop()?.replace(/^\s+|\s+$/g, '') ?? '' : errString
                    throw `Build failed: ${errString}`
                } else {
                    throw `Build failed with exit code ${error.error.code} ${error.stderr}`
                }
            }
            var errors: CompilationError[] = await this.pasreCompilationErrors(rawError)
            if (errors.length == 0) {
                throw 'Unable to parse compilation errors'
            }
            var errorsCount = 0
            for (let e = 0; e < errors.length; e++) {
                errorsCount = errors.reduce((a, b) => a + b.places.length, 0)
                print(" ")
                for (let i = 0; i < errors.length; i++) {
                    const error = errors[i]
                    print(` ${error.file.split('/').pop()} ${error.file}`)
                    print(` `)
                    for (let n = 0; n < error.places.length; n++) {
                        const place = error.places[n]
                        let lineNumberString = `${place.line} |`
                        let errorTitle = ' ERROR '
                        let errorTitlePrefix = '   '
                        print(`${errorTitlePrefix}${errorTitle} ${place.reason}`)
                        let _len = (errorTitle.length + 5) - lineNumberString.length
                        let errorLinePrefix = ''
                        for (let index = 0; index < _len; index++) {
                            errorLinePrefix += ' '
                        }
                        print(`${errorLinePrefix}${lineNumberString} ${place.code}`)
                        let linePointerBeginning = ''
                        for (let index = 0; index < lineNumberString.length - 2; index++) {
                            linePointerBeginning += ' '
                        }
                        linePointerBeginning += '|'
                        print(`${errorLinePrefix}${linePointerBeginning} ${place.pointer}`)
                        print(' ')
                    }
                }
            }
            var ending = ''
            if (errorsCount == 1) {
                ending = 'found 1 error ❗️'
            } else if (errorsCount > 1) {
                ending = `found ${errorsCount} errors ❗️❗️❗️`
            }
            throw `🥺 Unable to continue cause of failed compilation, ${ending}\n`
        }
    }

    async pasreCompilationErrors(rawError: string): Promise<CompilationError[]> {
        var errors: CompilationError[] = []
        var lines = rawError.split('\n')
        while (lines.length > 0) {
            var places: Place[] = []
            const line = lines.pop()
            if (!line) continue
            function lineIsPlace(line: string): boolean {
                return line.startsWith('/') && line.split('/').length > 1 && line.includes('.swift:')
            }
            function placeErrorComponents(line: string): string[] | null {
                const components = line.split(':')
                if (components.length != 5 || !components[3].includes('error')) {
                    return null
                }
                return components
            }
            if (!lineIsPlace(line)) continue
            function parsePlace(line: string): void {
                const components = placeErrorComponents(line)
                if (!components) return
                const filePath = components[0]
                function gracefulExit() {
                    if (places.length > 0) {
                        let error = errors.find(element => element.file == filePath)
                        if (error) {
                            for (let i = 0; i < places.length; i++) {
                                const place = places[i]
                                const found = error.places.find(element => element.line == place.line && element.reason == place.reason)
                                if (!found) break
                                error.places.push(place)
                            }
                            error.places.sort((a, b) => (a.line < b.line) ? 1 : -1)
                        } else {
                            places.sort((a, b) => (a.line < b.line) ? 1 : -1)
                            errors.push(new CompilationError(filePath, places))
                        }
                    }
                }

                const lineInFile = Number(components[1])
                if (isNaN(lineInFile)) return gracefulExit()
                
                const reason = components[4]
                const lineWithCode = lines.shift()
                if (!lineWithCode) return gracefulExit()
                
                const lineWithPointer = lines.shift()
                if (!lineWithPointer?.includes('^')) return gracefulExit()
                
                places.push(new Place(lineInFile, reason, lineWithCode, lineWithPointer))
                
                const nextLine = lines.shift()
                if (nextLine && lineIsPlace(nextLine) && placeErrorComponents(nextLine)?.shift() == filePath) {
                    return parsePlace(nextLine)
                }
                gracefulExit()
            }
            parsePlace(line)
        }
        if (errors.length == 0) return []
        errors.sort((a, b) => (a.file.split('/').pop()! < b.file.split('/').pop()!) ? 1 : -1)
        return errors
    }
}

class Place {
    line: number
    reason: string
    code: string
    pointer: string

    constructor (line: number, reason: string, code: string, pointer: string) {
        this.line = line
        this.reason = reason
        this.code = code
        this.pointer = pointer
    }
}

class CompilationError {
    file: string
    places: Place[]
    
    constructor (file: string, places: Place[]) {
        this.file = file
        this.places = places
    }
}

export interface Preview {
    width: number
    height: number
    title: string
    module: string
    class: string
    html: string
}
interface SourceControl {
    identity: string
    location: any
    requirement: any
}
interface Dependency {
    sourceControl?: SourceControl
}
interface Product {
    name: string
    targets: string[]
    executable: boolean
}
interface Target {
    name: string
    type: string
    dependencies: any[]
}
export interface PackageContent {
    dependencies: Dependency[]
    products: Product[]
    targets: Target[]
}
export enum SwiftBuildType {
    Native = 'native',
    Wasi = 'wasi'
}
export function allSwiftBuildTypes(): SwiftBuildType[] {
    return [SwiftBuildType.Native, SwiftBuildType.Wasi]
}

export interface SplashData {
    styles: string[],
    scripts: string[],
    links: string[],
    pathToFile?: string,
    body?: string,
    iframeStyle?: string
}

export interface Index {
    title?: string,
    lang?: string,
    metas?: any[],
    links?: any[],
    scripts?: any[],
    splash?: SplashData
}

export interface SwiftTargets {
    executables: string[],
    serviceWorkers: string[]
}