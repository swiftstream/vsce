import * as fs from 'fs'
import JSON5 from 'json5'
import { Uri } from 'vscode'
import { extensionContext, ExtensionStream, isInContainer, sidebarTreeView } from './extension'
import { Stream } from './streams/stream'

export var currentToolchain: string = `${getToolchainNameFromURL()}`
export var pendingNewToolchain: string | undefined

export function getToolchainNameFromURL(url: string | undefined = undefined): string | undefined {
    const value: string | undefined = url ?? process.env.S_TOOLCHAIN_URL_X86
    if (!value) return 'undefined'
    return value.split('/').pop()
        ?.replace(/^swift-/, '')
        .replace(/(\.tar\.gz|\.zip)$/, '')
        .replace(/(-ubuntu\d+\.\d+|-aarch64|_x86_64|_aarch64|-a)/g, '')
}

export function setPendingNewToolchain(value: string | undefined) {
    if (!isInContainer() && value) {
        currentToolchain = value
        pendingNewToolchain = undefined
    } else {
        pendingNewToolchain = value
    }
    sidebarTreeView?.refresh()
}

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

export function getToolchainsList(): any {
    const path = Uri.joinPath(extensionContext.extensionUri, 'toolchains.json')
    const stringData = fs.readFileSync(path.path, 'utf8')
    return JSON5.parse(stringData)
}
}