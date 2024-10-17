import * as fs from 'fs'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'
import { buildDevPath, buildProdPath, LogLevel, print } from '../../webber'
import { projectDirectory, webber } from '../../extension'
import { SwiftBuildType } from '../../swift'

export async function proceedWasmFiles(options: { targets: string[], release: boolean }): Promise<any> {
    if (!webber) throw `webber is null`
    const buildFolder = `${projectDirectory}/.build/.${SwiftBuildType.Wasi}/${options.release ? 'release' : 'debug'}`
    const destPath = `${projectDirectory}/${options.release ? buildProdPath : buildDevPath}`
    if (!fs.existsSync(buildFolder)) throw `Unable to process WASM files, seems swift project hasn't been built`
    const timeMeasure = new TimeMeasure()
    print(`🧱 Processing wasm files`, LogLevel.Detailed)
    for (let i = 0; i < options.targets.length; i++) {
        const target = options.targets[i]
        if (options.release) {
            // TODO: wasm-opt
        }
        fs.cpSync(`${buildFolder}/${target}.wasm`, `${destPath}/${target.toLowerCase()}.wasm`)
    }
    timeMeasure.finish()
    print(`🎉 Finished processing wasm files in ${timeMeasure.time}ms`, LogLevel.Detailed)
}