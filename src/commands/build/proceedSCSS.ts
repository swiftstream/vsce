import * as fs from 'fs'
import * as sass from 'sass'
import { projectDirectory, webber } from '../../extension'
import { buildDevPath, buildProdPath, buildStatus, LogLevel, print, webSourcesPath } from '../../webber'
import { findFilesRecursively, getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey } from '../../helpers/filesHelper'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

export async function proceedSCSS(options: { force: boolean, release: boolean }) {
    if (!webber) throw `webber is null`
    const measure = new TimeMeasure()
    const webFolder = `${projectDirectory}/${webSourcesPath}`
    const buildFolder = `${projectDirectory}/${options.release ? buildProdPath : buildDevPath}`
    const lastModifiedDate = getLastModifiedDate(LastModifiedDateType.SCSS)
    const scssInBuildFolder = findFilesRecursively(['scss', 'sass'], buildFolder, lastModifiedDate)
    const scssInSourcesFolder = findFilesRecursively(['scss', 'sass'], webFolder, lastModifiedDate)
    const doesModifiedAnyInSources = scssInSourcesFolder.filter((x) => x.modified).length > 0
    if (!options.force && scssInBuildFolder.length == 0 && !doesModifiedAnyInSources) {
        print(`💨 Skipping processing SCSS files because \`force == false\` and nothing was modified `, LogLevel.Verbose)
        return
    }
    if (scssInBuildFolder.length == 0 && scssInSourcesFolder.length == 0) {
        measure.finish()
        print(`💨 Skipping SCSS files, nothing found in ${measure.time}ms`, LogLevel.Detailed)
        return
    }
    print(`🎨 Processing SCSS files`, LogLevel.Detailed)
    for (let i = 0; i < scssInBuildFolder.length; i++) {
        const item = scssInBuildFolder[i];
        const relativePath = item.path.replace(buildFolder, '')
        const saveTo = `${item.folder}/${item.pureName}.css`
        print(`🌺 Compile SCSS file: ${relativePath}`, LogLevel.Verbose)
        buildStatus(`Compile SCSS files: ${item.name}`)
        const result = sass.compile(item.path, { style: options.release ? 'compressed' : 'expanded' })
        fs.writeFileSync(saveTo, result.css)
        // Remove original file to avoid recompilation
        fs.rmSync(item.path)
    }
    for (let i = 0; i < scssInSourcesFolder.length; i++) {
        const item = scssInSourcesFolder[i];
        const relativePath = item.path.replace(webFolder, '')
        const saveTo = `${buildFolder}${relativePath}`.replace(item.name, `${item.pureName}.css`)
        print(`🌺 Compile SCSS file: ${relativePath}`, LogLevel.Verbose)
        buildStatus(`Compile SCSS files: ${item.name}`)
        const result = sass.compile(item.path, { style: options.release ? 'compressed' : 'expanded' })
        fs.writeFileSync(saveTo, result.css)
    }
    saveLastModifiedDateForKey(LastModifiedDateType.SCSS)
    measure.finish()
    print(`🎨 Compiled SCSS in ${measure.time}ms`, LogLevel.Detailed)
}