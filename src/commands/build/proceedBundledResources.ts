import * as fs from 'fs'
import { SwiftBuildType } from '../../swift'
import { projectDirectory } from '../../extension'
import { buildDevFolder, buildProdFolder } from '../../streams/web/webStream'
import { print } from '../../streams/stream'
import { LogLevel } from '../../streams/stream'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

export function proceedBundledResources(options: { release: boolean }) {
    const buildFolder = `${projectDirectory}/.build/.${SwiftBuildType.Wasi}/${options.release ? 'release' : 'debug'}`
    const destPath = `${projectDirectory}/${options.release ? buildProdFolder : buildDevFolder}`
    if (!fs.existsSync(buildFolder)) throw `Unable to copy bundled resources, seems swift project hasn't been built`
    const measure = new TimeMeasure()
    const items = fs.readdirSync(buildFolder)
    const resourceFolders = items.filter((x) => x.endsWith('.resources') && !x.startsWith('JavaScriptKit_JavaScriptKit'))
    print(`📄 Processing bundle resources`, LogLevel.Detailed)
    for (let f = 0; f < resourceFolders.length; f++) {
        const folder = resourceFolders[f]
        const dirPath = `${buildFolder}/${folder}`
        // NOTE: Rewritten from cpFileSync because of EACCESS issue with folders, cause it is copying folder permissions as well
        function proceedFolder(dirPath: string, toFolder?: string | undefined) {
            const newDestPath = toFolder ? `${destPath}/${toFolder}` : `${destPath}`
            if (!fs.existsSync(newDestPath))
                fs.mkdirSync(newDestPath, { recursive: true })
            const items = fs.readdirSync(dirPath)
            for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
                const item = items[itemIndex]
                const fromFile = `${dirPath}/${item}`
                const isFolder = fs.statSync(fromFile).isDirectory()
                if (isFolder) {
                    proceedFolder(fromFile, item)
                } else {
                    // skip .map files for production
                    if (options.release && fromFile.endsWith('.map'))
                        continue
                    const toFile = `${newDestPath}/${item}`
                    print(`📑 Copy file ${folder.replace('.resources', '')}/${item} → ${options.release ? buildProdFolder : buildDevFolder}/${item}`, LogLevel.Verbose)
                    if (fs.existsSync(toFile))
                        print(`🚨 \`/${item}\` file has been overwritten`, LogLevel.Detailed)
                    let data: string | undefined
                    try {
                        data = fs.readFileSync(fromFile, 'utf8')
                    } catch (error) {
                        print(`🚨 fs.openSync(${fromFile}) failed: ${error}`, LogLevel.Detailed)
                    }
                    if (data) {
                        try {
                            fs.writeFileSync(toFile, data)
                        } catch (error) {
                            print(`🚨 fs.writeFileSync(${toFile}) failed: ${error}`, LogLevel.Detailed)
                        }
                        try {
                            fs.rmSync(fromFile)
                            print(`🧹 Cleaned up file ${folder.replace('.resources', '')}/${item}`, LogLevel.Verbose)
                        } catch (error) {
                            print(`🚨 fs.rmSync(${fromFile}) failed: ${error}`, LogLevel.Detailed)
                        }
                    } else {
                        print(`🚨 Skipping ${toFile}: something is wrong with it`, LogLevel.Detailed)
                    }
                }
            }
        }
        proceedFolder(dirPath)
    }
    measure.finish()
    print(`📄 Processed bundle resources in ${measure.time}ms`, LogLevel.Detailed)
}