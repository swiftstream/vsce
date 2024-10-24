import * as fs from 'fs'
import { BashResult } from './bash'
import { LogLevel, print, Webber } from './webber'
import { TimeMeasure } from './helpers/timeMeasureHelper'
import { humanFileSize } from './helpers/filesHelper'

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
        const measure = new TimeMeasure()
        print(`🧳 Gzipping ${options.filename}`, LogLevel.Detailed)
        const filePath = `${options.path}/${options.filename}`
        const gzFilePath = `${options.path}/${options.filename}.gz`
        const originalSize = fs.statSync(filePath).size
        const result = await this.execute([options.level ? `-${options.level}` : '-2', '-f', '--keep', options.filename], options.path)
        const newSize = fs.statSync(gzFilePath).size
        measure.finish()
        print(`🧳 Gzipped ${options.filename}.wasm ${humanFileSize(originalSize)} → ${humanFileSize(newSize)} in ${measure.time}ms`, LogLevel.Detailed)
        return result
    }
}