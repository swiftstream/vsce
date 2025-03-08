import { AbortHandler, BashResult } from './bash'
import { WebStream } from './streams/web/webStream'
import { print } from './streams/stream'
import { LogLevel } from './streams/stream'

export class NPM {
    private binPath?: string

    constructor(private webStream: WebStream, private cwd: string) {}

    private async execute(args: string[], abortHandler: AbortHandler): Promise<BashResult> {
        if (!this.binPath)
            this.binPath = await this.webStream.bash.which('npm')
        if (!this.binPath)
            throw 'Path to npm is undefined'
        print(`executing npm ${args.join(' ')} at: ${this.cwd}`, LogLevel.Verbose)
        const result = await this.webStream.bash.execute({
            path: this.binPath!,
            description: `npm`,
            cwd: this.cwd,
            abortHandler: abortHandler
        }, args)
        return result
    }

    async install(args: string[] = [], abortHandler: AbortHandler): Promise<BashResult> {
        return await this.execute(['install', ...args, '--no-audit', '--no-fund', '--no-progress', '--quiet'], abortHandler)
    }

    async run(args: string[] = [], abortHandler: AbortHandler): Promise<BashResult> {
        return await this.execute(['run', ...args], abortHandler)
    }
}