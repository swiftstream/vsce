import { BashResult } from './bash'
import { print } from './streams/stream'
import { LogLevel, Stream } from './streams/stream'
import { projectDirectory } from './extension'

export class Pgrep {
    private binPath?: string

    constructor(private stream: Stream) {}

    private async execute(args: string[], cwd: string): Promise<BashResult> {
        if (!this.binPath)
            this.binPath = await this.stream.bash.which('pgrep')
        if (!this.binPath)
            throw 'Path to gzip is undefined'
        print(`executing pgrep ${args.join(' ')}`, LogLevel.Verbose)
        const result = await this.stream.bash.execute({
            path: this.binPath!,
            description: `pgrep`,
            cwd: cwd,
            isCancelled: () => false
        }, args)
        return result
    }

    async isAnyBlockingSwiftProcessRunning(): Promise<boolean> {
        if (!projectDirectory) return false
        const result = await this.execute(['-fl', 'swift-(build|package)'], projectDirectory)
        return result.stdout.includes('swift')
    }
}