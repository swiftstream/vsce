import * as fs from 'fs'
import { SwiftBuildType } from '../../swift'
import { projectDirectory } from '../../extension'
import { buildDevPath, buildProdPath, LogLevel, print } from '../../webber'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

export async function proceedBundledResources(options: { release: boolean }) {
    const buildFolder = `${projectDirectory}/.build/.${SwiftBuildType.Wasi}/${options.release ? 'release' : 'debug'}`
    const destPath = `${projectDirectory}/${options.release ? buildProdPath : buildDevPath}`
    if (!fs.existsSync(buildFolder)) throw `Unable to copy bundled resources, seems swift project hasn't been built`
    const timeMeasure = new TimeMeasure()
    const items = fs.readdirSync(buildFolder)
    const resourceFolders = items.filter((x) => x.endsWith('.resources') && !x.startsWith('JavaScriptKit_JavaScriptKit'))
    print(`Copy bundle resources started`, LogLevel.Detailed)
    for (let f = 0; f < resourceFolders.length; f++) {
        const folder = resourceFolders[f]
        const dirPath = `${buildFolder}/${folder}`
        const items = fs.readdirSync(dirPath)
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const item = items[itemIndex]
            const fromFile = `${dirPath}/${item}`
            const toFile = `${destPath}/${item}`
            print(`📑 copy ${folder.replace('.resources', '')}/${item} → ${options.release ? buildProdPath : buildDevPath}/${item}`, LogLevel.Detailed)
            if (fs.existsSync(toFile))
                print(`⚠️ ${item} has been overwritten`, LogLevel.Detailed)
            fs.cpSync(fromFile, toFile, { recursive: true, force: true })
            if (fs.statSync(fromFile).isDirectory()) fs.rmdirSync(fromFile)
            else fs.rmSync(fromFile)
        }
    }
    timeMeasure.finish()
    print(`Copy finished in ${timeMeasure.time}ms`, LogLevel.Detailed)
}