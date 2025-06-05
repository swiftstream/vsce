import * as fs from 'fs'
import { BashResult } from './bash'
import { projectDirectory } from './extension'
import { LogLevel, print, Stream } from './streams/stream'
import { SwiftBuildType } from './swift'

export class SwiftPackageDump {
    private binPath?: string
    private dumpedOnce = false

    content!: PackageContent
    
    constructor(private stream: Stream) {}

    private async execute(args: string[], options: {
        cwd: string,
        type: SwiftBuildType
    }): Promise<BashResult> {
        if (!this.binPath)
            this.binPath = await this.stream.bash.which('swift')
        if (!this.binPath)
            throw 'Path to swift is undefined'
        print(`executing swift ${args.join(' ')}`, LogLevel.Unbearable)
        var env = process.env
        env.SWIFT_MODE = `${options.type}`.toUpperCase()
        const result = await this.stream.bash.execute({
            path: this.binPath,
            description: `swift package dump`,
            cwd: options.cwd,
            avoidPrintingError: true
        }, args)
        return result
    }

    async dump(options: {
        fresh: boolean,
        type: SwiftBuildType
    }): Promise<void> {
        if (!projectDirectory) throw `Swift Package Dump: project directory can't be null`
        if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
            throw `No Package.swift file in the project directory`
        }
        if (!options.fresh && this.dumpedOnce) return
        const result = await this.execute(['package', 'dump-package'], {
            cwd: projectDirectory,
            type: options.type
        })
        if (result.stderr.length > 0)
            throw `Swift Package Dump: ${result.stderr}`
        if (result.code != 0) {
            throw `Swift Package Dump: failed with ${result.code} code`
        }
        const json = JSON.parse(result.stdout)
        const dependencies: Dependency[] = json.dependencies
        const products: Product[] = json.products.map((x:any) => {
            var p: Product = x
            p.executable = x.type.hasOwnProperty('executable')
            p.isLibrary = x.type?.library !== undefined
            return p
        })
        const targets: Target[] = json.targets
        this.content = {
            name: json.name,
            dependencies: dependencies,
            products: products,
            targets: targets
        }
        this.dumpedOnce = true
    }
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
    isLibrary: boolean
}
interface Target {
    name: string
    type: string
    dependencies: any[]
}
export interface PackageContent {
    name: string
    dependencies: Dependency[]
    products: Product[]
    targets: Target[]
}