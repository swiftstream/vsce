import * as fs from 'fs'
import * as path from 'path'
import { print } from './streams/stream'
import { LogLevel } from './streams/stream'
import { currentLoggingLevel } from './streams/stream'
import { ContextKey, extensionContext, isArm64, projectDirectory, sidebarTreeView } from './extension'
import { isString } from './helpers/isString'
import { FileWithError } from './sidebarTreeView'
import { Stream } from './streams/stream'
import { commands, ShellExecution, Task, TaskExecution, TaskProvider, tasks, TaskScope, Terminal, window } from 'vscode'
import { AbortHandler } from './bash'

export class Swift {
    constructor(private stream: Stream) {}

    static v5Mode = process.env.S_VERSION_MAJOR === '5'
    static v6Mode = process.env.S_VERSION_MAJOR === '6'

    private runTaskProvider?: SwiftRunTaskProvider

    async startRunTask(options: {
        release: boolean,
        target: string,
        args: string[]
    }): Promise<{ pid: number } | undefined> {
        if (this.runTaskProvider) {
            if (this.runTaskProvider.isRunning) {
                this.runTaskProvider.terminate()
                await new Promise((r) => setTimeout(r, 500))
            }
            this.runTaskProvider = undefined
        }
        if (!this.runTaskProvider) {
            this.runTaskProvider = new SwiftRunTaskProvider(options)
            extensionContext.subscriptions.push(tasks.registerTaskProvider(SwiftRunTaskProvider.SwiftRunType, this.runTaskProvider))
        }
        if (!this.runTaskProvider) return undefined
        return await this.runTaskProvider.start()
    }

    stopRunTask() {
        this.runTaskProvider?.terminate()
        this.runTaskProvider = undefined
    }

    private async execute(args: string[], options: {
        type: SwiftBuildType,
        abortHandler?: AbortHandler | undefined
    }): Promise<string> {
        var env = process.env
        env.SWIFT_MODE = `${options.type}`.toUpperCase()
        const result = await this.stream.bash.execute({
            path: this.stream.toolchain.swiftPath,
            description: `get executable target`,
            cwd: projectDirectory,
            env: env,
            abortHandler: options.abortHandler
        }, args)
        if (result.stderr.length > 0)
            throw result.stderr
        return result.stdout
    }

    async getTargets(options: {
        type: SwiftBuildType,
        abortHandler: AbortHandler | undefined
    }): Promise<SwiftTargets> {
        print(`Going to retrieve swift targets`, LogLevel.Unbearable)
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            let result = new SwiftTargets()
            const dump = await this.execute(['package', 'dump-package'], {
                type: options.type,
                abortHandler: options.abortHandler
            })
            const json = JSON.parse(dump)
            for (let target of json.targets) {
                switch (target.type) {
                    case 'regular':
                        result.regular.push(target.name)
                        break
                    case 'executable':
                        result.executables.push(target.name)
                        break
                    case 'test':
                        result.tests.push(target.name)
                        break
                    case 'system':
                        result.system.push(target.name)
                        break
                    case 'binary':
                        result.binaries.push(target.name)
                        break
                    case 'plugin':
                        result.plugins.push(target.name)
                        break
                    case 'macro':
                        result.macroses.push(target.name)
                        break
                    default:
                        result.regular.push(target.name)
                }
            }
            print(`Retrieved targets: [${result.executables.join(', ')}]`, LogLevel.Unbearable)
            return result
        } catch (error: any) {
            console.dir({getTargetsError: error})
            throw `Unable to get executable targets from the package dump`
        }
    }

    async getWebTargets(options?: {
        abortHandler?: AbortHandler | undefined
    }): Promise<SwiftWebTargets> {
        print(`Going to retrieve swift targets`, LogLevel.Unbearable)
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            var result: SwiftWebTargets = {
                executables: [],
                serviceWorkers: []
            }
            const dump = await this.execute(['package', 'dump-package'], {
                type: SwiftBuildType.Wasi,
                abortHandler: options?.abortHandler
            })
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

    doesPackageContainsTestTarget(): boolean {
        const p = path.join(projectDirectory!, 'Package.swift')
        if (!fs.existsSync(p)) return false
        const content = fs.readFileSync(p, 'utf8')
        return content.includes('.testTarget')
    }

    async packageDump(options: {
        type: SwiftBuildType,
        abortHandler: AbortHandler
    }): Promise<PackageContent | undefined> {
        const args: string[] = ['package', 'dump-package']
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            const result = await this.execute(args, {
                type: options.type,
                abortHandler: options.abortHandler
            })
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

    async grabPWAManifest(options: {
        serviceWorkerTarget: string,
        abortHandler: AbortHandler
    }): Promise<any> {
        const executablePath = `${projectDirectory}/.build/debug/${options.serviceWorkerTarget}`
        if (!fs.existsSync(executablePath)) {
            throw `Missing executable binary of the service target, can't retrieve manifest`
        }
        var env = process.env
        env.SWIFT_MODE = `${SwiftBuildType.Native}`.toUpperCase()
        try {
            const result = await this.stream.bash.execute({
                path: executablePath,
                description: `grab PWA manifest`,
                cwd: projectDirectory,
                env: env,
                abortHandler: options.abortHandler
            }, [])
            return JSON.parse(result.stdout)
        } catch (error: any) {
            console.dir({grabServiceWorkerManifestError: error})
            throw `Unable to grab service worker manifest`
        }
    }

    async grabIndex(options: {
        target: string,
        abortHandler: AbortHandler
    }): Promise<Index | undefined> {
        const executablePath = `${projectDirectory}/.build/debug/${options.target}`
        if (!fs.existsSync(executablePath)) {
            throw `Missing executable binary of the ${options.target} target, can't retrieve index data`
        }
        var env = process.env
        env.SWIFT_MODE = `${SwiftBuildType.Native}`.toUpperCase()
        try {
            const result = await this.stream.bash.execute({
                path: executablePath,
                description: `grab Index`,
                cwd: projectDirectory,
                env: env,
                abortHandler: options.abortHandler
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

    async packageResolve(options: {
        type: SwiftBuildType,
        abortHandler: AbortHandler,
        progressHandler?: (p: string) => void
    }): Promise<void> {
        const args: string[] = ['package', 'resolve', "--build-path", options.type == SwiftBuildType.Native ? './.build' : `./.build/.${options.type}`]
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        var env = process.env
        env.SWIFT_MODE = `${options.type}`.toUpperCase()
        try {
            const result = await this.stream.bash.execute({
                path: this.stream.toolchain.swiftPath,
                description: `resolve dependencies for ${options.type}`,
                cwd: projectDirectory,
                env: env,
                abortHandler: options.abortHandler,
                processInstanceHandler: (process) => {
                    options.abortHandler.addProcess(process)
                    if (options.abortHandler.isCancelled) return
                    if (!options.progressHandler) return
                    process.stderr.on('data', function(msg) {
                        if (options.abortHandler.isCancelled) return
                        const m = msg.toString()
                        if (m.startsWith('[')) {
                            options.progressHandler!(m.split(']')[0].replace('[', ''))
                        }
                    })
                }
            }, args)
            if (result.code != 0) {
                if (result.stderr.length > 0) {
                    console.error({packageResolve: result.stderr})
                }
                throw `Unable to resolve swift packages for ${options.type}`
            }
        } catch (error: any) {
            print(`error: ${isString(error) ? error : JSON.stringify(error)}`, LogLevel.Normal, true)
            throw `Unable to resolve swift packages for ${options.type}`
        }
    }

    async version(): Promise<string | undefined> {
        const args: string[] = ['--version']
        try {
            return await this.execute(args, { type: SwiftBuildType.Native })
        } catch (error: any) {
            return undefined
        }
    }

    async previews(options: {
        type: SwiftBuildType,
        moduleName: string,
        previewNames: string[]
    }): Promise<Preview[] | undefined> {
        const args: string[] = ['run', '-Xswiftc', '-DWEBPREVIEW', options.moduleName, '--previews', ...options.previewNames.map((x) => `${options.moduleName}/${x}`), '--build-path', './.build']
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            const result = await this.execute(args, { type: options.type })
            const json: any = JSON.parse(result)
            return json.previews
        } catch (error: any) {
            return undefined
        }
    }

    async splash(options: {
        type: SwiftBuildType,
        productName: string
    }) {
        const args: string[] = ['run', '-Xswiftc', '-DWEBSPLASH', '-Xswiftc', '-DWEBPREVIEW', options.productName, '--build-path', './.build']
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        try {
            const splashDelimiter = "==SPLASH=="
            const str: string = await this.execute(args, { type: options.type })
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

    async build(options: {
        type: SwiftBuildType,
        mode: SwiftBuildMode,
        targetName: string,
        release: boolean,
        abortHandler: AbortHandler,
        progressHandler?: (p: string) => void
    }) {
        print(`\`swift build\` started`, LogLevel.Verbose)
        var args: string[] = [
            'build',
            '-c', options.release ? 'release' : 'debug',
            '--product', options.targetName,
            '--build-path', options.type == SwiftBuildType.Native ? './.build' : `./.build/.${options.type}`
        ]
        switch (options.mode) {
            case SwiftBuildMode.Standard:
                if (Swift.v5Mode) args.push('--enable-test-discovery')
                break
            case SwiftBuildMode.StaticLinuxX86:
                if (Swift.v5Mode) throw `Static Linux SDK is not available for Swift 5`
                args.push(...['--swift-sdk', 'x86_64-swift-linux-musl'])
                args.push(...['--static-swift-stdlib'])
                break
            case SwiftBuildMode.StaticLinuxArm:
                if (Swift.v5Mode) throw `Static Linux SDK is not available for Swift 5`
                args.push(...['--swift-sdk', 'aarch64-swift-linux-musl'])
                args.push(...['--static-swift-stdlib'])
                if (options.release) args.push('-Xlinker', '-s')
                break
            case SwiftBuildMode.Wasi:
                if (Swift.v5Mode) args.push('--enable-test-discovery')
                if (Swift.v5Mode) args.push(...['--triple', 'wasm32-unknown-wasi'])
                else args.push(...['--swift-sdk', 'wasm32-unknown-wasi'])
                args.push(...['--static-swift-stdlib'])
                args.push(...['-Xswiftc', '-DJAVASCRIPTKIT_WITHOUT_WEAKREFS'])
                args.push(...['-Xswiftc', '-Xclang-linker'])
                args.push(...['-Xswiftc', '-mexec-model=reactor'])
                args.push(...['-Xlinker', '-lCoreFoundation'])
                args.push(...['-Xlinker', '-licuuc'])
                args.push(...['-Xlinker', '-licui18n'])
                args.push(...['-Xlinker', '--stack-first'])
                args.push(...['-Xlinker', '--export=main'])
                break
            case SwiftBuildMode.Wasip1Threads:
                if (Swift.v5Mode) throw `Wasi Preview 1 (threads) SDK is not available for Swift 5`
                args.push(...['--swift-sdk', 'wasm32-unknown-wasip1-threads'])
                args.push(...['--static-swift-stdlib'])
                args.push(...['-Xswiftc', '-DJAVASCRIPTKIT_WITHOUT_WEAKREFS'])
                args.push(...['-Xswiftc', '-Xclang-linker'])
                args.push(...['-Xswiftc', '-mexec-model=reactor'])
                args.push(...['-Xlinker', '-lCoreFoundation'])
                args.push(...['-Xlinker', '-licuuc'])
                args.push(...['-Xlinker', '-licui18n'])
                args.push(...['-Xlinker', '--stack-first'])
                args.push(...['-Xlinker', '--export=main'])
                break
        }
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `Missing Package.swift file`
        }
        var env = process.env
        env.SWIFT_MODE = `${options.type}`.toUpperCase()
        try {
            if (options.abortHandler.isCancelled) return
            print(`🧰 ${this.stream.toolchain.swiftPath} ${args.join(' ')}`, LogLevel.Verbose)
            const result = await this.stream.bash.execute({
                path: this.stream.toolchain.swiftPath,
                description: `build swift`,
                cwd: projectDirectory,
                env: env,
                abortHandler: options.abortHandler,
                processInstanceHandler: (process) => {
                    options.abortHandler.addProcess(process)
                    if (options.abortHandler.isCancelled) return
                    if (!options.progressHandler) return
                    process.stdout.on('data', function(msg) {
                        if (options.abortHandler.isCancelled) return
                        const m = msg.toString()
                        if (m.startsWith('[')) {
                            options.progressHandler!(m.split(']')[0].replace('[', ''))
                        }
                    })
                }
            }, args)
            if (options.abortHandler.isCancelled) return
            const ending = await this.processCompilationErrors(result.stdout, () => options.abortHandler.isCancelled)
            if (options.abortHandler.isCancelled) return
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
            const ending = await this.processCompilationErrors(rawError, () => options.abortHandler.isCancelled)
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

    // MARK: Targets

    cachedBuildTargets: SwiftTargets | undefined
    cachedTestTargets: SwiftTargets | undefined
    selectedDebugTarget: string | undefined
    selectedReleaseTarget: string | undefined
    selectedTestTarget: string | undefined

    makeTmpCopyOfTargetBinary(options: { release: boolean }): boolean {
        const selectedTarget = this.selectedTarget({ release: options.release })
        if (!selectedTarget) return false
        const pathFrom = path.join(projectDirectory!, '.build', options.release ? 'release' : 'debug', selectedTarget)
        const pathTo = path.join(projectDirectory!, '.build', options.release ? 'release' : 'debug', '_AppToDeploy')
        if (!fs.existsSync(pathFrom)) return false
        fs.copyFileSync(pathFrom, pathTo)
        return true
    }
    
    selectedTarget(options: { release: boolean }): string | undefined {
        switch (options.release) {
            case true: return this.selectedReleaseTarget
            case false: return this.selectedDebugTarget
        }
    }
    
    async askToChooseTargetIfNeeded(options: { release: boolean, abortHandler?: AbortHandler, force?: boolean }) {
        let selectedTarget = this.selectedTarget({ release: options.release })
        if (options.force === true || !selectedTarget) {
            try {
                if (options.force === true || !this.cachedBuildTargets) {
                    const targetsDump = await this.getTargets({
                        type: SwiftBuildType.Native,
                        abortHandler: options.abortHandler
                    })
                    this.cachedBuildTargets = targetsDump
                }
                const allTargets = this.cachedBuildTargets.all({ excludeTests: true })
                commands.executeCommand('setContext', ContextKey.hasCachedTargets, allTargets.length > 0)
                if (allTargets.length == 1) {
                    this.selectedReleaseTarget = allTargets[0]
                    this.selectedDebugTarget = allTargets[0]
                } else if (allTargets.length > 0) {
                    if (options.release) {
                        await this.chooseReleaseTarget()
                    } else {
                        await this.chooseDebugTarget()
                    }
                }
                if (options.release && this.selectedReleaseTarget) sidebarTreeView?.refresh()
                else if (!options.release && this.selectedDebugTarget) sidebarTreeView?.refresh()
            } catch (error) {
                if (!this.cachedBuildTargets) throw error
            }
        }
    }

    async chooseDebugTarget() {
        const allTargets = this.cachedBuildTargets?.all({ excludeTests: true }) ?? []
        if (allTargets.length > 0) {
            this.selectedDebugTarget = await window.showQuickPick(allTargets, {
                placeHolder: `Select target to build`
            })
        }
        if (this.selectedDebugTarget) {
            if (!this.selectedReleaseTarget)
                this.selectedReleaseTarget = this.selectedDebugTarget
            sidebarTreeView?.refresh()
        }
    }

    async chooseReleaseTarget() {
        const allTargets = this.cachedBuildTargets?.all({ excludeTests: true }) ?? []
        if (allTargets.length > 0) {
            this.selectedReleaseTarget = await window.showQuickPick(allTargets, {
                placeHolder: `Select target to build`
            })
        }
        if (this.selectedReleaseTarget) {
            if (!this.selectedDebugTarget)
                this.selectedDebugTarget = this.selectedReleaseTarget
            sidebarTreeView?.refresh()
        }
    }

    async chooseTestTarget() {
        const allTargets = this.cachedBuildTargets?.all({ onlyTests: true }) ?? []
        if (allTargets.length > 0) {
            this.selectedReleaseTarget = await window.showQuickPick(allTargets, {
                placeHolder: `Select target to test`
            })
        }
        if (this.selectedReleaseTarget) {
            if (!this.selectedDebugTarget)
                this.selectedDebugTarget = this.selectedReleaseTarget
            sidebarTreeView?.refresh()
        }
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
export enum SwiftBuildMode {
    Standard = 'Standard (glibc)',
	StaticLinuxX86 = 'Static Linux (x86-musl)',
	StaticLinuxArm = 'Static Linux (arm-musl)',
    Wasi = 'Wasi',
	Wasip1Threads = 'Wasi Preview 1 (threads)'
}
export function allSwiftBuildTypes(): SwiftBuildType[] {
    /// Really important to have Native first!
    return [SwiftBuildType.Native, SwiftBuildType.Wasi]
}
export function compilationFolder(params: {
    target: string,
    mode: SwiftBuildMode,
    release: boolean
}): string {
    const platform = isArm64 ? 'aarch64' : 'x86_64'
    const type = params.release ? 'release' : 'debug'
    switch (params.mode) {
        case SwiftBuildMode.Standard:
            return path.join(projectDirectory!, '.build', `${platform}-unknown-linux-gnu`, type, params.target)
        case SwiftBuildMode.StaticLinuxX86:
        case SwiftBuildMode.StaticLinuxArm:
            return path.join(projectDirectory!, '.build', `${platform}-swift-linux-musl`, type, params.target)
        case SwiftBuildMode.Wasi:
            return path.join(projectDirectory!, '.build', '.wasi', `wasm32-unknown-wasi`, type, params.target)
        case SwiftBuildMode.Wasip1Threads:
            return path.join(projectDirectory!, '.build', '.wasi', `wasm32-unknown-wasip1-threads`, type, params.target)
    }
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

export interface SwiftWebTargets {
    executables: string[],
    serviceWorkers: string[]
}

export class SwiftTargets {
    /// Targets that contains code for the Swift package's functionality.
    regular: string[] = []

    /// Targets that contains code for an executable's main module.
    executables: string[] = []

    /// Targets that contains tests for the Swift package's other targets.
    tests: string[] = []

    /// Targets that adapts a library on the system to work with Swift packages.
    system: string[] = []

    /// Targets that references a binary artifact.
    binaries: string[] = []

    /// Targets that provides a package plug-in.
    plugins: string[] = []

    /// Targets that provides a Swift macro.
    macroses: string[] = []

    all(options?: {
        onlyExecutables?: boolean,
        onlyBinaries?: boolean,
        onlyRegular?: boolean,
        onlyPlugins?: boolean,
        onlyMacroses?: boolean,
        onlyTests?: boolean,
        onlySystem?: boolean,
        excludeExecutables?: boolean,
        excludeBinaries?: boolean,
        excludeRegular?: boolean,
        excludePlugins?: boolean,
        excludeMacroses?: boolean,
        excludeTests?: boolean,
        excludeSystem?: boolean
    }): string[] {
        if (options?.onlyExecutables === true)
            return this.executables
        if (options?.onlyBinaries === true)
            return this.binaries
        if (options?.onlyRegular === true)
            return this.regular
        if (options?.onlyPlugins === true)
            return this.plugins
        if (options?.onlyMacroses === true)
            return this.macroses
        if (options?.onlyTests === true)
            return this.tests
        if (options?.onlySystem === true)
            return this.system
        let result: string[] = []
        if (!options?.excludeExecutables)
            result.push(...this.executables)
        if (!options?.excludeBinaries)
            result.push(...this.binaries)
        if (!options?.excludeRegular)
            result.push(...this.regular)
        if (!options?.excludePlugins)
            result.push(...this.plugins)
        if (!options?.excludeMacroses)
            result.push(...this.macroses)
        if (!options?.excludeTests)
            result.push(...this.tests)
        if (!options?.excludeSystem)
            result.push(...this.system)
        return result
    }
}

// MARK: Tasks

class SwiftRunTaskProvider implements TaskProvider {
    static SwiftRunType = 'swift'
    private taskExecution: TaskExecution | undefined
    private terminal: Terminal | undefined
    private command: string
    isRunning: boolean = false
    release: boolean
    task: Task
    
    constructor(options: {
        release: boolean,
        target: string,
        args: string[]
    }) {
        this.command = `${path.join(projectDirectory!, '.build', options.release ? 'release' : 'debug', options.target)} ${options.args.join(' ')}`
        this.release = options.release
        this.task = new Task(
            { type: SwiftRunTaskProvider.SwiftRunType },
            TaskScope.Workspace,
            `Run ${SwiftRunTaskProvider.SwiftRunType}`,
            SwiftRunTaskProvider.SwiftRunType,
            new ShellExecution(this.command),
            []
        )
        tasks.onDidEndTaskProcess((e) => {
            if (e.execution.task.name === this.task.name) {
                commands.executeCommand('setContext', options.release ? ContextKey.isRunningReleaseTarget : ContextKey.isRunningDebugTarget, false)
                this.isRunning = false
                sidebarTreeView?.refresh()
            }
        })
    }

    public provideTasks(): Task[] | undefined {
        return [this.task]
    }

    public resolveTask(_task: Task): Task | undefined {
        return undefined
    }

    public async start(): Promise<{ pid: number }> {
        return new Promise((resolve) => {
            tasks.executeTask(this.task).then(() => {}, (reason) => {
                print(`🕵️‍♂️ Unable to run Swift: ${reason}`, LogLevel.Verbose)
            })
            tasks.onDidStartTaskProcess((e) => {
                if (e.execution.task.name === this.task.name) {
                    commands.executeCommand('setContext', this.release ? ContextKey.isRunningReleaseTarget : ContextKey.isRunningDebugTarget, true)
                    this.isRunning = true
                    sidebarTreeView?.refresh()
                    this.taskExecution = e.execution
                    this.terminal = window.terminals.find((x) => x.name.includes(this.task.name))
                    resolve({ pid: e.processId })
                }
            })
        })
    }

    public reveal() {
        this.terminal?.show(true)
    }

    public terminate() {
        if (this.taskExecution) {
            this.taskExecution.terminate()
            this.taskExecution = undefined
        } else if (this.terminal) {
            this.terminal.dispose()
            this.terminal = undefined
        }
    }
}