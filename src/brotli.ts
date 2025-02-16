import * as fs from 'fs'
import { BashResult } from './bash'
import { LogLevel, print, Webber } from './webber'
import { TimeMeasure } from './helpers/timeMeasureHelper'
import { humanFileSize } from './helpers/filesHelper'

export class Brotli {
    private binPath?: string

    constructor(private webber: Webber) {}

    private async execute(args: string[], cwd: string): Promise<BashResult> {
        if (!this.binPath)
            this.binPath = await this.webber.bash.which('brotli')
        if (!this.binPath)
            throw 'Path to brotli is undefined'
        print(`executing brotli ${args.join(' ')}`, LogLevel.Verbose)
        const result = await this.webber.bash.execute({
            path: this.binPath!,
            description: `brotli`,
            cwd: cwd,
            isCancelled: () => false
        }, args)
        return result
    }

    async compress(options: {
        level?: number,
        filename: string,
        path: string
    }): Promise<BashResult> {
        const measure = new TimeMeasure()
        print(`🧳 Brotling ${options.filename}`, LogLevel.Detailed)
        const filePath = `${options.path}/${options.filename}`
        const brFilePath = `${options.path}/${options.filename}.br`
        const originalSize = fs.statSync(filePath).size
        const result = await this.execute(['-q', options.level ? `${options.level}` : '11', filePath, '-f', '-o', brFilePath], options.path)
        const newSize = fs.statSync(brFilePath).size
        measure.finish()
        print(`🧳 Brotled ${options.filename} ${humanFileSize(originalSize)} → ${humanFileSize(newSize)} in ${measure.time}ms`, LogLevel.Detailed)
        return result
    }
}