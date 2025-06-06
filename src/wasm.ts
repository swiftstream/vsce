import * as fs from 'fs'
import { AbortHandler, BashResult } from './bash'
import { WebStream } from './streams/web/webStream'
import { print } from './streams/stream'
import { LogLevel } from './streams/stream'
import { lowerI64Imports } from '@wasmer/wasm-transformer'
import { TimeMeasure } from './helpers/timeMeasureHelper'
import { humanFileSize } from './helpers/filesHelper'

export class Wasm {
    private stripBinPath?: string
    private optBinPath?: string

    constructor(private webStream: WebStream) {}

    /// Optimizes for old Safari
    async lowerI64Imports(options: {
        destPath: string,
        lowercasedTarget: string,
        abortHandler: AbortHandler
    }): Promise<void> {
        const measure = new TimeMeasure()
        print(`🎞️ Lowering I64imports in ${options.lowercasedTarget}.wasm`, LogLevel.Detailed)
        const fullPath = `${options.destPath}/${options.lowercasedTarget}.wasm`
        let bytes: Uint8Array = fs.readFileSync(fullPath)
        bytes = await lowerI64Imports(bytes)
        if (options.abortHandler.isCancelled) return
        fs.writeFileSync(fullPath, bytes)
        measure.finish()
        print(`🎞️ Lowered I64imports in ${options.lowercasedTarget}.wasm in ${measure.time}ms`, LogLevel.Detailed)
    }

    /// Removes all custom sections, reduces file size by 1/3
    async strip(options: {
        destPath: string,
        lowercasedTarget: string,
        abortHandler: AbortHandler
    }): Promise<BashResult | undefined> {
        const measure = new TimeMeasure()
        if (!this.stripBinPath)
            this.stripBinPath = await this.webStream.bash.which('wasm-strip')
        if (!this.stripBinPath)
            throw 'Path to wasm-strip is undefined'
        const fullPath = `${options.destPath}/${options.lowercasedTarget}.wasm`
        const originalSize = fs.statSync(fullPath).size
        print(`🔪 Stripping ${options.lowercasedTarget}.wasm`, LogLevel.Detailed)
        print(`executing wasm-strip ${options.lowercasedTarget}.wasm`, LogLevel.Verbose)
        const result = await this.webStream.bash.execute({
            path: this.stripBinPath!,
            description: `wasm-strip`,
            cwd: options.destPath,
            abortHandler: options.abortHandler
        }, [`${options.lowercasedTarget}.wasm`])
        if (options.abortHandler.isCancelled) return undefined
        const newSize = fs.statSync(fullPath).size
        measure.finish()
        print(`🔪 Stripped ${options.lowercasedTarget}.wasm ${humanFileSize(originalSize)} → ${humanFileSize(newSize)} in ${measure.time}ms`, LogLevel.Detailed)
        return result
    }

    /// Loads WebAssembly and runs Binaryen IR passes on it, reduces file size by 1/2
    async opt(options: {
        destPath: string,
        lowercasedTarget: string,
        abortHandler: AbortHandler
    }): Promise<BashResult | undefined> {
        const measure = new TimeMeasure()
        if (!this.optBinPath)
            this.optBinPath = await this.webStream.bash.which('wasm-opt')
        if (!this.optBinPath)
            throw 'Path to wasm-opt is undefined'
        const fullPath = `${options.destPath}/${options.lowercasedTarget}.wasm`
        const originalSize = fs.statSync(fullPath).size
        const args: string[] = ['-Os', '--enable-bulk-memory', '--enable-sign-ext', fullPath, '-o', fullPath]
        print(`💾 Optimizing ${options.lowercasedTarget}.wasm`, LogLevel.Detailed)
        print(`executing wasm-opt ${args.join(' ')}`, LogLevel.Verbose)
        const result = await this.webStream.bash.execute({
            path: this.optBinPath!,
            description: `wasm-opt`,
            cwd: options.destPath,
            abortHandler: options.abortHandler
        }, args)
        if (options.abortHandler.isCancelled) return undefined
        const newSize = fs.statSync(fullPath).size
        measure.finish()
        print(`💾 Optimized ${options.lowercasedTarget}.wasm ${humanFileSize(originalSize)} → ${humanFileSize(newSize)} in ${measure.time}ms`, LogLevel.Detailed)
        return result
    }
}