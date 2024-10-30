import * as fs from 'fs'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'
import { buildDevFolder, buildProdFolder, LogLevel, print } from '../../webber'
import { projectDirectory, webber } from '../../extension'
import { SwiftBuildType } from '../../swift'

export async function proceedWasmFile(options: { target: string, release: boolean, gzipSuccess: () => void, gzipFail: (any) => void }): Promise<any> {
    if (!webber) throw `webber is null`
    const buildFolder = `${projectDirectory}/.build/.${SwiftBuildType.Wasi}/${options.release ? 'release' : 'debug'}`
    const destPath = `${projectDirectory}/${options.release ? buildProdFolder : buildDevFolder}`
    if (!fs.existsSync(buildFolder)) throw `Unable to process WASM files, seems swift project hasn't been built`
    const timeMeasure = new TimeMeasure()
    const lowercasedTarget = options.target.toLowerCase()
    print(`🧮 Processing ${lowercasedTarget}.wasm file`, LogLevel.Detailed)
    fs.cpSync(`${buildFolder}/${options.target}.wasm`, `${destPath}/${lowercasedTarget}.wasm`)
    if (options.release) {
        // Optimization for old Safari
        await webber.wasm.lowerI64Imports({ destPath: destPath, lowercasedTarget: lowercasedTarget })
        // Stripping debug info
        await webber.wasm.strip({ destPath: destPath, lowercasedTarget: lowercasedTarget })
        // Optimize, reduces the size, and improves the performance through various optimization techniques
        await webber.wasm.opt({ destPath: destPath, lowercasedTarget: lowercasedTarget })
    }
    timeMeasure.finish()
    // TODO: hot reloads
    const gzipOptions = { path: destPath, filename: `${lowercasedTarget}.wasm`, level: options.release ? 9 : undefined }
    if (options.release) {
        await webber?.gzip.compress(gzipOptions)
        options.gzipSuccess()
    } else {
        webber?.gzip.compress(gzipOptions).then(() => {
            options.gzipSuccess()
        }, (error) => {
            print(`😳 Unable to gzip ${options.target}.wasm`, LogLevel.Detailed)
            options.gzipFail(error)
        })
    }
    print(`🧮 Processed wasm file in ${timeMeasure.time}ms`, LogLevel.Detailed)
}