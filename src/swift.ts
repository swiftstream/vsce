import * as fs from 'fs'
import { print } from './streams/stream'
import { LogLevel } from './streams/stream'
import { currentLoggingLevel } from './streams/stream'
import { projectDirectory, sidebarTreeView } from './extension'
import { isString } from './helpers/isString'
import { FileWithError } from './sidebarTreeView'
import { Stream } from './streams/stream'

export class Swift {
    constructor(private stream: Stream) {}

    private async execute(args: string[]): Promise<string> {
        var env = process.env
        env.WEBBER = 'TRUE'
        const result = await this.stream.bash.execute({
            path: this.stream.toolchain.swiftPath,
            description: `get executable target`,
            cwd: projectDirectory,
            env: env,
            isCancelled: () => false
        }, args)
        if (result.stderr.length > 0)
            throw result.stderr
        return result.stdout
    }

    async getTargets(): Promise<SwiftTargets> {
        print(`Going to retrieve swift targets`, LogLevel.Unbearable)
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
            print(`Retrieved targets: [${result.executables.join(', ')}]`, LogLevel.Unbearable)
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
        const executablePath = `${projectDirectory}/.build/debug/${options.serviceWorkerTarget}`
        if (!fs.existsSync(executablePath)) {
            throw `Missing executable binary of the service target, can't retrieve manifest`
        }
        try {
            const result = await this.stream.bash.execute({
                path: executablePath,
                description: `grab PWA manifest`,
                cwd: projectDirectory,
                isCancelled: () => false
            }, [])
            return JSON.parse(result.stdout)
        } catch (error: any) {
            console.dir({grabServiceWorkerManifestError: error})
            throw `Unable to grab service worker manifest`
        }
    }

    async grabIndex(options: { target: string }): Promise<Index | undefined> {
        const executablePath = `${projectDirectory}/.build/debug/${options.target}`
        if (!fs.existsSync(executablePath)) {
            throw `Missing executable binary of the ${options.target} target, can't retrieve index data`
        }
        try {
            const result = await this.stream.bash.execute({
                path: executablePath,
                description: `grab Index`,
                cwd: projectDirectory,
                isCancelled: () => false
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
        const args: string[] = ['package', 'resolve', "--build-path", type == SwiftBuildType.Native ? './.build' : `./.build/.${type}`]
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            const result = await this.stream.bash.execute({
                path: this.stream.toolchain.swiftPath,
                description: `resolve dependencies for ${type}`,
                cwd: projectDirectory,
                isCancelled: () => false
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
        const args: string[] = ['run', '-Xswiftc', '-DWEBPREVIEW', moduleName, '--previews', ...previewNames.map((x) => `${moduleName}/${x}`), '--build-path', './.build']
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
        const args: string[] = ['run', '-Xswiftc', '-DWEBSPLASH', '-Xswiftc', '-DWEBPREVIEW', productName, '--build-path', './.build']
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

    async build(options: { type: SwiftBuildType, targetName: string, release: boolean, isCancelled: () => boolean, progressHandler?: (p: string) => void }) {
        print(`\`swift build\` started`, LogLevel.Verbose)
        var args: string[] = [
            'build',
            '-c', options.release ? 'release' : 'debug',
            '--product', options.targetName,
            '--build-path', options.type == SwiftBuildType.Native ? './.build' : `./.build/.${options.type}`
        ]
        // TODO: check swift version, it is different for >=6.0.0 because of SDK
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
            if (options.isCancelled()) return
            print(`🧰 ${this.stream.toolchain.swiftPath} ${args.join(' ')}`, LogLevel.Verbose)
            const result = await this.stream.bash.execute({
                path: this.stream.toolchain.swiftPath,
                description: `build swift`,
                cwd: projectDirectory,
                env: env,
                isCancelled: options.isCancelled,
                processInstanceHandler: (process) => {
                    if (options.isCancelled()) return
                    // TODO: process.kill('SIGKILL')
                    if (!options.progressHandler) return
                    process.stdout.on('data', function(msg) {
                        if (options.isCancelled()) return
                        const m = msg.toString()
                        if (m.startsWith('[')) {
                            options.progressHandler!(m.split(']')[0].replace('[', ''))
                        }
                    })
                }
            }, args)
            if (options.isCancelled()) return
            const ending = await this.processCompilationErrors(result.stdout, options.isCancelled)
            if (options.isCancelled()) return
            if (ending.length > 0) {
                print(`${ending}`, LogLevel.Detailed)
            }
            sidebarTreeView?.refresh()
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
            const ending = await this.processCompilationErrors(rawError, options.isCancelled)
            sidebarTreeView?.refresh()
            throw `🥺 Unable to continue cause of failed compilation, ${ending}\n`
        }
    }

    async processCompilationErrors(rawOutput: string, isCancelled: () => boolean): Promise<string> {
        var errors: CompilationError[] = await this.pasreCompilationErrors(rawOutput)
        if (JSON.stringify(errors) === '[]') return ''
        sidebarTreeView?.refresh()
        if (errors.length == 0) {
            throw 'Unable to parse compilation errors'
        }
        var errorsCount = 0
        var warningsCount = 0
        var notesCount = 0
        for (let e = 0; e < errors.length; e++) {
            if (isCancelled()) return ''
            const error = errors[e]
            const eCount = error.places.filter((p) => p.type == 'error')?.length ?? 0
            const wCount = error.places.filter((p) => p.type == 'warning')?.length ?? 0
            const nCount = error.places.filter((p) => p.type == 'note')?.length ?? 0
            errorsCount += eCount
            warningsCount += wCount
            notesCount += nCount
            print(' ', eCount > 0 ? LogLevel.Normal : LogLevel.Detailed)
            const found = this.foundString(eCount, wCount, nCount)
            print(`📄 ${error.file.split('/').pop()} ${found}`, eCount > 0 ? LogLevel.Normal : LogLevel.Detailed)
            var fileWithError: FileWithError = {
                path: error.file,
                name: error.file.split('/').pop() ?? '',
                errors: []
            }
            for (let n = 0; n < error.places.length; n++) {
                if (isCancelled()) return ''
                const place = error.places[n]
                fileWithError.errors.push({
                    type: place.type,
                    line: place.line,
                    point: place.pointer.length,
                    lineWithCode: place.code,
                    description: place.reason
                })
                // don't show warnings without detailed+ mode
                if (currentLoggingLevel == LogLevel.Normal && place.type != 'error') continue
                print(`${n + 1}. ${place.reason}`, eCount > 0 ? LogLevel.Normal : LogLevel.Detailed)
                print(`${error.file}:${place.line}`, eCount > 0 ? LogLevel.Normal : LogLevel.Detailed)
                print(`${place.code}`, eCount > 0 ? LogLevel.Normal : LogLevel.Detailed)
                print(`${place.pointer}`, eCount > 0 ? LogLevel.Normal : LogLevel.Detailed)
                print(' ', eCount > 0 ? LogLevel.Normal : LogLevel.Detailed)
            }
            sidebarTreeView?.addFileWithError(fileWithError)
        }
        const endings = this.foundString(errorsCount, warningsCount, notesCount)
        let ending = ''
        if (endings.length > 0) {
            ending = `found ${endings}`
        }
        return ending
    }

    foundString(eCount: number, wCount: number, nCount: number): string {
        let endings: string[] = []
        if (eCount == 1) {
            endings.push('1 error ⛔️')
        } else if (eCount > 1) {
            endings.push(`${eCount} errors ⛔️`)
        }
        if (wCount == 1) {
            endings.push('1 warning ❗️')
        } else if (wCount > 1) {
            endings.push(`${wCount} warnings ❗️`)
        }
        if (nCount == 1) {
            endings.push('1 note 📝')
        } else if (nCount > 1) {
            endings.push(`${nCount} notes 📝`)
        }
        return endings.join(', ')
    }

    async pasreCompilationErrors(rawError: string): Promise<CompilationError[]> {
        var errors: CompilationError[] = []
        var lines = rawError.split('\n')
        while (lines.length > 0) {
            var places: Place[] = []
            const line = lines.shift()
            if (!line || line === undefined) break
            function lineIsPlace(line: string): boolean {
                return line.startsWith('/') && line.split('/').length > 1 && line.includes('.swift:')
            }
            function placeErrorComponents(line: string): string[] | undefined {
                const components = line.split(':')
                function isOfRightType(): boolean {
                    return components[3].includes('error') || components[3].includes('note') || components[3].includes('warning')
                }
                if (components.length < 5 || !isOfRightType()) {
                    return undefined
                }
                if (components.length == 5) {
                    return components
                } else {
                    var comps: string[] = []
                    var i = 0
                    while (components.length > 0) {
                        if (i < 4) {
                            var c = components.shift()
                            if (!c) return undefined
                            comps[i] = c
                            i++
                        } else {
                            comps[i] = components.join(':')
                            break
                        }
                    }
                    return comps
                }
            }
            if (!lineIsPlace(line)) continue
            function parsePlace(line: string): void {
                const components = placeErrorComponents(line)
                if (!components || components === undefined) return
                const filePath = components[0]
                const type = components[3].trim()
                function gracefulExit() {
                    if (places.length > 0) {
                        let error = errors.find(element => element.file == filePath)
                        if (error) {
                            for (let i = 0; i < places.length; i++) {
                                const place = places[i]
                                if (!error.places.find(element => element.line == place.line && element.reason == place.reason))
                                    error.places.push(place)
                            }
                            error.places.sort((a, b) => (a.line > b.line) ? 1 : -1)
                        } else {
                            places.sort((a, b) => (a.line > b.line) ? 1 : -1)
                            errors.push(new CompilationError(filePath, places))
                        }
                    }
                }

                const lineInFile = Number(components[1])
                if (isNaN(lineInFile)) return gracefulExit()
                
                const reason = components[4]
                const lineWithCode = lines.shift()
                if (!lineWithCode) return gracefulExit()
                
                var lineWithPointer: string | undefined = '^'
                if (lines.length > 0 && lines[0]?.includes('^')) {
                    lineWithPointer = lines.shift()
                    if (!lineWithPointer?.includes('^')) lineWithPointer = '^'
                    lineWithPointer = lineWithPointer.replaceAll('~', '')
                }
                
                if (!places.find((p) => p.type == type && p.line == lineInFile && p.reason == reason))
                    places.push(new Place(type, lineInFile, reason, lineWithCode, lineWithPointer))
                
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
    type: string
    line: number
    reason: string
    code: string
    pointer: string

    constructor (type: string, line: number, reason: string, code: string, pointer: string) {
        this.type = type
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
    /// Really important to have Native first!
    return [SwiftBuildType.Native, SwiftBuildType.Wasi]
}

export function createSymlinkFoldersIfNeeded() {
    const buildPath = `${projectDirectory}/.build`
    function createFolderIfNeeded(path) {
        if (!fs.existsSync(path))
            fs.mkdirSync(path)
    }
    createFolderIfNeeded(buildPath)
    createFolderIfNeeded(`${buildPath}/checkouts`)
    createFolderIfNeeded(`${buildPath}/repositories`)
    const buildTypes = allSwiftBuildTypes().filter((x) => x != SwiftBuildType.Native)
    for (let i = 0; i < buildTypes.length; i++) {
        const type = buildTypes[i]
        const typeBuildPath = `${buildPath}/.${type}`
        if (!fs.existsSync(typeBuildPath))
            fs.mkdirSync(typeBuildPath)
        function createSymlink(name: string) {
            let pathTarget = `${buildPath}/${name}`
            let pathSymlink = `${typeBuildPath}/${name}`
            if (fs.existsSync(pathSymlink)) {
                if (fs.lstatSync(pathSymlink).isSymbolicLink()) {}
                else if (fs.lstatSync(pathSymlink).isDirectory()) {
                    fs.rmSync(pathSymlink, { recursive: true, force: true })
                    fs.symlinkSync(pathTarget, pathSymlink)
                }
            } else {
                fs.symlinkSync(pathTarget, pathSymlink)
            }
        }
        createSymlink('checkouts')
        createSymlink('repositories')
    }
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