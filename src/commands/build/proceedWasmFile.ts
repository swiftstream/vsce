import * as fs from 'fs'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'
import { buildDevPath, buildProdPath, LogLevel, print } from '../../webber'
import { projectDirectory, webber } from '../../extension'
import { SwiftBuildType } from '../../swift'

export async function proceedWasmFile(options: { target: string, release: boolean, gzipCallback: () => void }): Promise<any> {
    if (!webber) throw `webber is null`
    const buildFolder = `${projectDirectory}/.build/.${SwiftBuildType.Wasi}/${options.release ? 'release' : 'debug'}`
    const destPath = `${projectDirectory}/${options.release ? buildProdPath : buildDevPath}`
    if (!fs.existsSync(buildFolder)) throw `Unable to process WASM files, seems swift project hasn't been built`
    const timeMeasure = new TimeMeasure()
    if (options.release) {
        // TODO: optimizeForOldSafari -> lowerI64Imports
        // TODO: stripDebugInfo
        // TODO: wasm-opt
    }
    const lowercasedTarget = options.target.toLowerCase()
    print(`🧮 Processing ${lowercasedTarget}.wasm file`, LogLevel.Detailed)
    fs.cpSync(`${buildFolder}/${options.target}.wasm`, `${destPath}/${lowercasedTarget}.wasm`)
    timeMeasure.finish()
    // TODO: hot reloads
    const gzipOptions = { path: destPath, filename: `${lowercasedTarget}.wasm`, level: options.release ? 9 : undefined }
    if (options.release) {
        await webber?.gzip.compress(gzipOptions)
        options.gzipCallback()
    } else {
        webber?.gzip.compress(gzipOptions).then(() => {
            options.gzipCallback()
        }, () => {
            print(`😳 Unable to gzip ${options.target}.wasm`, LogLevel.Detailed)
        })
    }
    print(`🧮 Processed wasm file in ${timeMeasure.time}ms`, LogLevel.Detailed)
}