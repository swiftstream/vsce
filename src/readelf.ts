import { BashResult } from './bash'
import { print } from './streams/stream'
import { LogLevel, Stream } from './streams/stream'
import { projectDirectory } from './extension'

export class ReadElf {
    private binPath?: string

    constructor(private stream: Stream) {}

    private async execute(args: string[], cwd: string): Promise<BashResult> {
        if (!this.binPath)
            this.binPath = await this.stream.bash.which('readelf')
        if (!this.binPath)
            throw 'Path to readelf is undefined'
        print(`executing readelf ${args.join(' ')}`, LogLevel.Unbearable)
        const result = await this.stream.bash.execute({
            path: this.binPath,
            description: `readelf`,
            cwd: cwd,
            avoidPrintingError: true
        }, args)
        return result
    }

    async neededSoList(soPath: string): Promise<{ success: boolean, error?: unknown, list: string[] }> {
        if (!projectDirectory) return { success: false, list: [] }
        try {
            const result = await this.execute(['-d', soPath], projectDirectory)
            if (result.code != 0) return { success: false, list: [] }
            const list: string[] = []
            const neededRegex = /\(NEEDED\)\s+Shared library:\s+\[(.+?)\]/
            for (const line of result.stdout.split('\n')) {
                const match = neededRegex.exec(line)
                if (match) {
                    list.push(match[1])
                }
            }
            return { success: true, list: list }
        } catch (error: unknown) {
            return { success: false, error: error, list: [] }
        }
    }
}