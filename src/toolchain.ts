import { workspace } from "vscode"
import { Swift } from "./swift"
import { clearStatus, currentToolchain, Webber } from "./webber"
import { Bash } from "./bash"

export class Toolchain {
    private path: string = `/swift/toolchains/${currentToolchain}`

    get binPath(): string { return `${this.path}/usr/bin` }
    get libPath(): string { return `${this.path}/usr/lib` }
    get swiftPath(): string { return `${this.binPath}/swift` }

    constructor(private webber: Webber) {}

    async prepare() {

    }

    async checkVersion() {
        const result = await Bash.execute({
            path: this.swiftPath,
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
            await this.webber.swift.build(productName, release, tripleWasm)
            clearStatus()
        } catch (error) {
            clearStatus()
            throw error
        }
    }
}