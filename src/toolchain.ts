import { workspace } from "vscode"
import { Swift } from "./swift"
import { clearStatus, status } from "./webber"
import { Bash } from "./bash"

export class Toolchain {
    _path: string | null = null

    get swiftSettings(): {
        version: string,
        linkToArchive: string,
        pathToLocalArchive: string
    } { return workspace.getConfiguration('swift').get('settings')! }
    set swiftSettings(newSettings) {
        workspace.getConfiguration('swift').update('settings', newSettings)
    }

    get _binPath(): string { return `${this._path}/usr/bin` }
    get _libPath(): string { return `${this._path}/usr/lib` }
    get _pathToSwiftBin(): string { return `${this._binPath}/swift` }

    private _swift: Swift | null = null
    get swift(): Swift { return this._swift || (this._swift = new Swift(this)) }

    constructor() {}

    async prepare() {

    }

    async checkVersion() {
        const result = await Bash.execute({
            path: this._pathToSwiftBin,
            description: 'check swift toolchain version'
        }, ['--version'])
        const version = result.stdout
        if (version.length == 0)
            throw result.error({ noDetails: true })
        var components = version.split(' version ')
        const right = components[components.length - 1]
        components = right.split(' ')
        // const version = components[0]
    }

    async build(productName: string, release: boolean, tripleWasm: boolean = true) {
        try {
            await this.swift.build(productName, release, tripleWasm)
            clearStatus()
        } catch (error) {
            clearStatus()
            throw error
        }
    }
}