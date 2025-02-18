import * as fs from 'fs'
import * as sass from 'sass'
import { projectDirectory, currentStream } from '../../extension'
import { buildDevFolder, buildProdFolder, webSourcesFolder } from '../../streams/web/webStream'
import { buildStatus, print } from '../../streams/stream'
import { LogLevel } from '../../streams/stream'
import { findFilesRecursively, FoundFileItem, getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey } from '../../helpers/filesHelper'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

export async function proceedCSS(options: { force: boolean, release: boolean }) {
    if (!currentStream) throw `webStream is null`
    const measure = new TimeMeasure()
    const webFolder = `${projectDirectory}/${webSourcesFolder}`
    const buildFolder = `${projectDirectory}/${options.release ? buildProdFolder : buildDevFolder}`
    const lastModifiedDate = getLastModifiedDate(LastModifiedDateType.SCSS)
    const scssInBuildFolder = findFilesRecursively(['css', 'scss', 'sass'], buildFolder, lastModifiedDate)
    const scssInSourcesFolder = findFilesRecursively(['css', 'scss', 'sass'], webFolder, lastModifiedDate)
    const doesModifiedAnyInSources = scssInSourcesFolder.filter((x) => x.modified).length > 0
    if (!options.force && scssInBuildFolder.length == 0 && !doesModifiedAnyInSources) {
        print(`💨 Skipping processing CSS files because \`force == false\` and nothing was modified `, LogLevel.Verbose)
        return
    }
    if (scssInBuildFolder.length == 0 && scssInSourcesFolder.length == 0) {
        measure.finish()
        print(`💨 Skipping CSS files, nothing found in ${measure.time}ms`, LogLevel.Detailed)
        return
    }
    print(`🎨 Processing CSS files`, LogLevel.Detailed)
    function processArray(items: FoundFileItem[], folder: string) {
        const isBuildFolder = folder === buildFolder
        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            const relativePath = item.path.replace(folder, '')
            const saveTo = (isBuildFolder)
                ? `${item.folder}/${item.pureName}.css`
                : `${buildFolder}${relativePath}`.replace(item.name, `${item.pureName}.css`)
            print(`🌺 Compile CSS file: ${relativePath}`, LogLevel.Verbose)
            buildStatus(`Compile CSS files: ${item.name}`)
            const result = sass.compile(item.path, { style: options.release ? 'compressed' : 'expanded' })
            const saveToFolderPath = saveTo.split('/').slice(0, -1).join('/')
            if (!fs.existsSync(saveToFolderPath))
                fs.mkdirSync(saveToFolderPath, { recursive: true })
            fs.writeFileSync(saveTo, result.css)
        }
    }
    processArray(scssInBuildFolder, buildFolder)
    processArray(scssInSourcesFolder, webFolder)
    saveLastModifiedDateForKey(LastModifiedDateType.SCSS)
    measure.finish()
    print(`🎨 Processed CSS in ${measure.time}ms`, LogLevel.Detailed)
}