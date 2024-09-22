import * as fs from 'fs'
import * as sass from 'sass'
import path from 'path'
import { projectDirectory, webber } from '../../extension'
import { buildDevPath, buildProdPath, buildStatus, LogLevel, print, webSourcesPath } from '../../webber'
import { endsWithOneOfExtensions, getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey } from '../../helpers/filesHelper'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

export async function proceedSCSS(options: { force: boolean, release: boolean }) {
    if (!webber) throw `webber is null`
    const measure = new TimeMeasure()
    const webFolder = `${projectDirectory}/${webSourcesPath}`
    const buildFolder = `${projectDirectory}/${options.release ? buildProdPath : buildDevPath}`
    const lastModifiedDate = getLastModifiedDate(LastModifiedDateType.SCSS)
    const scssInBuildFolder = findSCSSFilesRecursively(buildFolder, lastModifiedDate)
    const scssInSourcesFolder = findSCSSFilesRecursively(webFolder, lastModifiedDate)
    const doesModifiedAnyInSources = scssInSourcesFolder.filter((x) => x.modified).length > 0
    if (!options.force && scssInBuildFolder.length == 0 && !doesModifiedAnyInSources) {
        print(`proceedSCSS skipping because force == false and nothing was modified `, LogLevel.Verbose)
        return
    }
    print(`🧱 Started processing SCSS files`)
    for (let i = 0; i < scssInBuildFolder.length; i++) {
        const item = scssInBuildFolder[i];
        const relativePath = item.path.replace(buildFolder, '')
        const saveTo = `${item.folder}/${item.pureName}.css`
        print(`Compile SCSS file: ${relativePath}`)
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
        print(`Compile SCSS file: ${relativePath}`, LogLevel.Verbose)
        buildStatus(`Compile SCSS files: ${item.name}`)
        const result = sass.compile(item.path, { style: options.release ? 'compressed' : 'expanded' })
        fs.writeFileSync(saveTo, result.css)
    }
    saveLastModifiedDateForKey(LastModifiedDateType.SCSS)
    measure.finish()
    print(`🎉 SCSS files compiled in ${measure.time}ms`)
}
interface SCSSItem {
    name: string,
    pureName: string,
    path: string,
    folder: string,
    modified: boolean
}
function findSCSSFilesRecursively(folder: string, lastModifedTimestampMs: number): SCSSItem[] {
    var items: SCSSItem[] = []
    const excluded: string[] = ['node_modules']
    for (const item in fs.readdirSync(folder)) {
        if (excluded.includes(item))
            continue
        const itemPath = `${folder}/${item}`
        const stat = fs.statSync(itemPath)
        var modifiedTime = stat.ctimeMs
        if (stat.mtimeMs > modifiedTime)
            modifiedTime = stat.mtimeMs
        if (stat.atimeMs > modifiedTime)
            modifiedTime = stat.atimeMs
        var modified = false
        if (lastModifedTimestampMs == 0) modified = true
        else modified = (
            lastModifedTimestampMs < stat.mtimeMs || 
            lastModifedTimestampMs < stat.atimeMs || 
            lastModifedTimestampMs < stat.ctimeMs
        )
        if (stat.isDirectory()) {
            items = [...items, ...findSCSSFilesRecursively(itemPath, lastModifedTimestampMs)]
        } else if (endsWithOneOfExtensions(item, ['scss', 'sass'])) {
            items.push({
                name: item,
                pureName: path.parse(itemPath).name,
                path: `${folder}/${item}`,
                folder: folder,
                modified: modified
            })
        }
    }
    return items
}