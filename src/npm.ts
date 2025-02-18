import { BashResult } from './bash'
import { WebStream } from './streams/web/webStream'
import { print } from './streams/stream'
import { LogLevel } from './streams/stream'

export class NPM {
    private binPath?: string

    constructor(private webStream: WebStream, private cwd: string) {}

    private async execute(args: string[]): Promise<BashResult> {
        if (!this.binPath)
            this.binPath = await this.webStream.bash.which('npm')
        if (!this.binPath)
            throw 'Path to npm is undefined'
        print(`executing npm ${args.join(' ')} at: ${this.cwd}`, LogLevel.Verbose)
        const result = await this.webStream.bash.execute({
            path: this.binPath!,
            description: `npm`,
            cwd: this.cwd,
            isCancelled: () => false
        }, args)
        return result
    }

    async install(args: string[] = []): Promise<BashResult> {
        return await this.execute(['install', ...args, '--no-audit', '--no-fund', '--no-progress', '--quiet'])
    }

    async run(args: string[] = []): Promise<BashResult> {
        return await this.execute(['run', ...args])
    }
}