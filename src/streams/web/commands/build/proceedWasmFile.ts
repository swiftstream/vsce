import * as fs from 'fs'
import { TimeMeasure } from '../../../../helpers/timeMeasureHelper'
import { buildDevFolder, buildProdFolder, isDebugBrotliEnabled, isDebugGzipEnabled } from '../../../../streams/web/webStream'
import { print } from '../../../../streams/stream'
import { LogLevel } from '../../../../streams/stream'
import { projectDirectory, webStream } from '../../../../extension'
import { SwiftBuildType } from '../../../../swift'
import { AbortHandler } from '../../../../bash'

export async function proceedWasmFile(options: {
    target: string,
    release: boolean,
    abortHandler: AbortHandler,
    gzipSuccess: () => void,
    gzipFail: (any) => void,
    gzipDisabled: () => void,
    brotliSuccess: () => void,
    brotliFail: (any) => void,
    brotliDisabled: () => void
}): Promise<any> {
    if (!webStream) throw `webStream is null`
    const buildFolder = `${projectDirectory}/.build/.${SwiftBuildType.Wasi}/${options.release ? 'release' : 'debug'}`
    const destPath = `${projectDirectory}/${options.release ? buildProdFolder : buildDevFolder}`
    if (!fs.existsSync(buildFolder)) throw `Unable to process WASM files, seems swift project hasn't been built`
    const timeMeasure = new TimeMeasure()
    const lowercasedTarget = options.target.toLowerCase()
    print(`🧮 Processing ${lowercasedTarget}.wasm file`, LogLevel.Detailed)
    fs.cpSync(`${buildFolder}/${options.target}.wasm`, `${destPath}/${lowercasedTarget}.wasm`)
    if (options.release) {
        // Optimization for old Safari
        await webStream.wasm.lowerI64Imports({ destPath: destPath, lowercasedTarget: lowercasedTarget, abortHandler: options.abortHandler })
        // Stripping debug info
        await webStream.wasm.strip({ destPath: destPath, lowercasedTarget: lowercasedTarget, abortHandler: options.abortHandler })
        // Optimize, reduces the size, and improves the performance through various optimization techniques
        await webStream.wasm.opt({ destPath: destPath, lowercasedTarget: lowercasedTarget, abortHandler: options.abortHandler })
    }
    if (options.abortHandler.isCancelled) return
    timeMeasure.finish()
    // TODO: hot reloads
    const originalWasm = `${lowercasedTarget}.wasm`
    const gzipOptions = { path: destPath, filename: originalWasm, level: options.release ? 9 : undefined, abortHandler: options.abortHandler }
    const brotliOptions = { path: destPath, filename: originalWasm, level: options.release ? 11 : 4, abortHandler: options.abortHandler }
    if (options.release) {
        try {
            await webStream?.gzip.compress(gzipOptions)
            options.gzipSuccess()
        } catch (error) {
            print(`😳 Unable to gzip ${options.target}.wasm`, LogLevel.Detailed)
            options.gzipFail(error)
        }
        try {
            await webStream?.brotli.compress(brotliOptions)
            options.brotliSuccess()
        } catch (error) {
            print(`😳 Unable to brotli ${options.target}.wasm`, LogLevel.Detailed)
            options.brotliFail(error)
        }
    } else {
        if (isDebugGzipEnabled) {
            webStream?.gzip.compress(gzipOptions).then(() => {
                options.gzipSuccess()
            }, (error) => {
                print(`😳 Unable to gzip ${options.target}.wasm`, LogLevel.Detailed)
                options.gzipFail(error)
            })
        } else {
            options.gzipDisabled()
        }
        if (isDebugBrotliEnabled) {
            webStream?.brotli.compress(brotliOptions).then(() => {
                options.brotliSuccess()
            }, (error) => {
                print(`😳 Unable to brotli ${options.target}.wasm`, LogLevel.Detailed)
                options.brotliFail(error)
            })
        } else {
            options.brotliDisabled()
        }
    }
    if (options.abortHandler.isCancelled) return
    print(`🧮 Processed wasm file in ${timeMeasure.time}ms`, LogLevel.Detailed)
}