import { BashResult } from './bash'
import { LogLevel, print, Webber } from './webber'

export class Gzip {
    private binPath?: string

    constructor(private webber: Webber) {}

    private async execute(args: string[], cwd: string): Promise<BashResult> {
        if (!this.binPath)
            this.binPath = await this.webber.bash.which('gzip')
        if (!this.binPath)
            throw 'Path to gzip is undefined'
        print(`executing gzip ${args.join(' ')}`, LogLevel.Verbose)
        const result = await this.webber.bash.execute({
            path: this.binPath!,
            description: `gzip`,
            cwd: cwd
        }, args)
        return result
    }

    async compress(options: {
        level?: number,
        filename: string,
        path: string
    }): Promise<BashResult> {
        return await this.execute([options.level ? `-${options.level}` : '-2', '-f', '--keep', options.filename], options.path)
    }
}