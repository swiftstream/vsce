import { BashResult } from './bash'
import { LogLevel, print, Webber } from './webber'

export class NPM {
    private binPath?: string

    constructor(private webber: Webber, private cwd: string) {}

    private async execute(args: string[]): Promise<BashResult> {
        if (!this.binPath)
            this.binPath = await this.webber.bash.which('npm')
        if (!this.binPath)
            throw 'Path to npm is undefined'
        print(`executing npm ${args.join(' ')} at: ${this.cwd}`, LogLevel.Verbose)
        const result = await this.webber.bash.execute({
            path: this.binPath!,
            description: `get executable target`,
            cwd: this.cwd
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