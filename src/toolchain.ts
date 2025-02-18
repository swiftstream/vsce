import { currentToolchain, Stream } from "./streams/stream"

export class Toolchain {
    private path: string = `/swift/toolchains/${currentToolchain}`

    get binPath(): string { return `${this.path}/usr/bin` }
    get libPath(): string { return `${this.path}/usr/lib` }
    get swiftPath(): string { return `${this.binPath}/swift` }

    constructor(private stream: Stream) {}

    async prepare() {

    }

    async checkVersion() {
        const result = await this.stream.bash.execute({
            path: this.swiftPath,
            description: 'check swift toolchain version',
            isCancelled: () => false
        }, ['--version'])
        const version = result.stdout
        if (version.length == 0)
            throw result.error({ noDetails: true })
        var components = version.split(' version ')
        const right = components[components.length - 1]
        components = right.split(' ')
        // const version = components[0]
    }
}