import { Bash } from './bash'
import { LogLevel, print, Webber } from './webber'
import { projectDirectory } from './extension'
import * as fs from 'fs'
import { window } from 'vscode'
import { isString } from './helpers/isString'

export class Swift {
    constructor(private webber: Webber) {}

    private async execute(args: string[]): Promise<string> {
        var env = process.env
        env.WEBBER = 'TRUE'
        const result = await Bash.execute({
            path: this.webber.toolchain.swiftPath,
            description: `get executable target`,
            cwd: projectDirectory,
            env: env
        }, args)
        if (result.stderr.length > 0)
            throw result.stderr
        return result.stdout
    }

    async getExecutableTargets(): Promise<string[]> {
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            const result = await this.execute(['package', 'dump-package'])
            const json = JSON.parse(result)
            if (json.products.length > 0) {
                var targets: string[] = []
                for (let product of json.products) {
                    if (product.type.hasOwnProperty('executable')) {
                        targets.push(product.name)
                    }
                }
                return targets
            }
            return []
        } catch (error: any) {
            console.dir({getExecutableTargetsError: error})
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

    async packageResolve(): Promise<void> {
        const args: string[] = ['package', 'resolve', "--build-path", "./.build/.wasi"]
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            const result = await Bash.execute({
                path: this.webber.toolchain.swiftPath,
                description: `get executable target`,
                cwd: projectDirectory
            }, args)
            window.showInformationMessage(`result: ${result.stderr}`)
        } catch (error: any) {
            print(`error: ${isString(error) ? error : JSON.stringify(error)}`, LogLevel.Normal, true)
            throw `Unable to resolve swift packages`
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
        const args: string[] = ['run', '-Xswiftc', '-DWEBPREVIEW', moduleName, '--previews', ...previewNames.map((x) => `${moduleName}/${x}`), '--build-path', './.build/.live']
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
        const args: string[] = ['run', '-Xswiftc', '-DWEBSPLASH', '-Xswiftc', '-DWEBPREVIEW', productName, '--build-path', './.build/.live']
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

    async build(options: { targetName: string, release: boolean, tripleWasm: boolean }) {
        print(`\`swift build\` started`, LogLevel.Verbose)
        var args: string[] = [
            'build',
            '-c', options.release ? 'release' : 'debug',
            '--product', options.targetName
        ]
        if (options.tripleWasm) {
            args = [...args,
                '--enable-test-discovery',
                '--static-swift-stdlib',
                '--triple', 'wasm32-unknown-wasi',
                '--build-path', './.build/.wasi',
                '-Xswiftc', '-DJAVASCRIPTKIT_WITHOUT_WEAKREFS',
                '-Xswiftc', '-Xclang-linker',
                '-Xswiftc', '-mexec-model=reactor',
                '-Xlinker', '-lCoreFoundation',
                '-Xlinker', '-licuuc',
                '-Xlinker', '-licui18n',
                '-Xlinker', '--stack-first',
                '-Xlinker', '--export=main'
            ]
        } else {
            args = ['--build-path', './.build/.native']
        }
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `Missing Package.swift file`
        }
        var env = process.env
        const startTime = new Date().getTime()
        try {
            print(`${this.webber.toolchain.swiftPath} ${args.join(' ')}`, LogLevel.Detailed)
            const result = await Bash.execute({
                path: this.webber.toolchain.swiftPath,
                description: `Building swift`,
                cwd: projectDirectory,
                env: env
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
            for (const error of errors) {
                errorsCount = errors.reduce((a, b) => a + b.places.length, 0)
                print(" ")
                for (const error of errors) {
                    print(` ${error.file.split('/').pop()} ${error.file}`)
                    print(` `)
                    for (const place of error.places) {
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
        const endTime = new Date().getTime()
        const time = endTime - startTime
        print(`🎉 Built in ${time}ms`)
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
                            for (const place of places) {
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