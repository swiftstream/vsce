import * as fs from 'fs'
import { JSDOM } from 'jsdom'
import { TimeMeasure } from "../../helpers/timeMeasureHelper"
import { projectDirectory } from '../../extension'
import { buildDevFolder, buildProdFolder, buildStatus, indexFile, LogLevel, print, webSourcesPath } from '../../webber'

export async function proceedAdditionalJS(options: { release: boolean, executableTargets: string[], exactFile?: string }) {
    const webFolder = `${projectDirectory}/${webSourcesPath}`
    const buildFolder = `${projectDirectory}/${options.release ? buildProdFolder : buildDevFolder}`
    function processItem(pathFrom: string): boolean {
        if (!fs.existsSync(pathFrom))
            return false
        const relativePathFrom = pathFrom.replace(webFolder, '')
        const filename = pathFrom.split('/').pop() ?? ''
        // avoid rewriting target files since they are managed by webpack
        if (options.executableTargets.map(x => x.toLowerCase()).includes(filename.replace('.js', '')))
            return false
        const pathTo = `${buildFolder}${relativePathFrom}`
        const pathFolderTo = pathTo.split('/').pop()
        if (!pathFolderTo)
            return false
        if (!fs.existsSync(pathFolderTo))
            fs.mkdirSync(pathFolderTo, { recursive: true })
        print(`📑 Copy ${relativePathFrom} → ${options.release ? buildProdFolder : buildDevFolder}/${relativePathFrom}`, LogLevel.Verbose)
        if (fs.existsSync(pathTo))
            print(`🚨 \`/${filename}\` has been overwritten`, LogLevel.Detailed)
        fs.copyFileSync(pathFrom, pathTo)
        // copy map file if debug build
        if (!options.release) {
            const mapPathFrom = `${pathFrom}.map`
            if (fs.existsSync(mapPathFrom)) {
                const relativeMapPathFrom = mapPathFrom.replace(webFolder, '')
                const mapPathTo = `${buildFolder}${relativeMapPathFrom}`
                const mapFilename = relativeMapPathFrom.split('/').pop() ?? ''
                print(`📑 Copy ${relativeMapPathFrom} → ${buildDevFolder}/${relativeMapPathFrom}`, LogLevel.Verbose)
                if (fs.existsSync(mapPathTo))
                    print(`🚨 \`/${mapFilename}\` has been overwritten`, LogLevel.Detailed)
                fs.copyFileSync(mapPathFrom, mapPathTo)
            }
        }
        return true
    }
    // it is for debug builds only
    if (options.exactFile) {
        processItem(options.exactFile)
        return
    }
    const measure = new TimeMeasure()
    buildStatus(`Processing additional JS files`)
    const files = listOfAdditionalJSFiles({ release: options.release, executableTargets: options.executableTargets })
    if (files.length == 0) {
        measure.finish()
        print(`💨 Skipping processing additional JS files, nothing found in ${measure.time}ms`, LogLevel.Detailed)
        return
    }
    print(`🫖 Processing additional JS files`, LogLevel.Detailed)
    for (let i = 0; i < files.length; i++) {
        if (!processItem(files[i]))
            continue
    }
    measure.finish()
    print(`🎨 Processed additional JS files in ${measure.time}ms`, LogLevel.Detailed)
}

export function listOfAdditionalJSFiles(options: { release: boolean, executableTargets: string[] }): string[] {
    const webFolder = `${projectDirectory}/${webSourcesPath}`
    const indexPath = `${webFolder}/${indexFile}`
    if (!fs.existsSync(indexPath))
        return []
    const html = fs.readFileSync(indexPath)
    const dom = new JSDOM(html)
    const scripts = dom.window.document.querySelectorAll('script')
    let result: string[] = []
    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i]
        let path = options.release ? script.getAttribute('srcProd') ?? script.src : script.getAttribute('srcDev') ?? script.src
        if (path.startsWith('http') || !path.endsWith('.js'))
            continue
        if (path.startsWith('../'))
            continue
        if (path.startsWith('/'))
            path = path.slice(1, path.length)
        if (path.startsWith('./'))
            path = path.slice(2, path.length)
        // avoid rewriting target files since they are managed by webpack
        if (options.executableTargets.map(x => x.toLowerCase()).includes(path.replace('.js', '')))
            continue
        const pathFrom = `${projectDirectory}/${webSourcesPath}/${path}`
        if (!fs.existsSync(pathFrom))
            continue
        result.push(pathFrom)
    }
    const resultCopy = [...result]
    // filter-out minified or full files according to build type
    return result.filter((x) => {
        const filename = x.split('/').pop()
        if (!filename)
            return false
        const minifiedEnding = '.min.js'
        const isMinified = filename.endsWith(minifiedEnding)
        // processing minified
        if (isMinified) {
            const nextPath = x.replace(`${webFolder}`, '').replace(minifiedEnding, '')
            // if found full file
            if (resultCopy.filter(y => y != x).filter(y => y === nextPath).length == 1) {
                // debug: filter minified out
                // release: keep it
                return !options.release
            }
            // if only minified present
            else {
                // debug: keep it
                // release: keep it
                return true
            }
        }
        // processing full
        else {
            const nextPath = x.replace(`${webFolder}`, '').replace('.js', '') + minifiedEnding
            // if found minified file
            if (resultCopy.filter(y => y != x).filter(y => y === nextPath).length == 1) {
                // debug: filter minified out
                // release: keep it
                return options.release
            }
            // if only full present
            else {
                // debug: keep it
                // release: keep it
                return true
            }
        }
    })
}