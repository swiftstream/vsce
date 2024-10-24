import * as fs from 'fs'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'
import { buildDevPath, buildProdPath, LogLevel, print } from '../../webber'
import { projectDirectory, webber } from '../../extension'
import { SwiftBuildType } from '../../swift'

export async function proceedWasmFile(options: { target: string, release: boolean }): Promise<any> {
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
    const gzipTimeMeasure = new TimeMeasure()
    print(`🎚️ Gzipping ${lowercasedTarget}.wasm`, LogLevel.Detailed)
    webber?.gzip.compress({ path: destPath, filename: `${lowercasedTarget}.wasm` }).then(() => {
        gzipTimeMeasure.finish()
        print(`🎚️ Finished gzipping ${lowercasedTarget}.wasm in ${gzipTimeMeasure.time}ms`, LogLevel.Detailed)
    }, () => {
        print(`😳 Unable to gzip ${options.target}.wasm`, LogLevel.Detailed)
    })
    print(`🧮 Processed wasm file in ${timeMeasure.time}ms`, LogLevel.Detailed)
}