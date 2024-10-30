import * as fs from 'fs'
import { projectDirectory } from '../../extension'
import { buildDevFolder, buildProdFolder, buildStatus, indexFile, LogLevel, print, webSourcesPath } from '../../webber'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'
import { findFilesRecursively, getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey } from '../../helpers/filesHelper'
import { Index, SplashData } from '../../swift'

const managedBy = `managedBy="SwifWeb"`

export async function proceedHTML(options: { appTargetName: string, manifest?: any, index?: Index, release: boolean }) {
    const measure = new TimeMeasure()
    const lastModifiedDate = getLastModifiedDate(LastModifiedDateType.HTML)
    const webFolder = `${projectDirectory}/${webSourcesPath}`
    const buildFolder = `${projectDirectory}/${options.release ? buildProdFolder : buildDevFolder}`
    const indexPath = `${webFolder}/${indexFile}`
    const manifestFileNameValue = options.manifest?.file_name ?? 'site'
    var isIndexChanged = false
    var lines: string[] = []
    print(`📜 Manifest present: ${options.manifest ? 'true' : 'false'}`, LogLevel.Unbearable)
    buildStatus(`Processing HTML files`)
    // generate index.html from scratch
    if (!fs.existsSync(indexPath)) {
        lines = [
            doctype(),
            openHTML(options.index?.lang ?? 'en-US'),
                openHead(),
                    title(options.index?.title ?? '&lrm;'),
                    ...(options.index?.metas ? options.index.metas.map((params) => tag('meta', params)) : []),
                    ...(options.index?.links ? options.index.links.map((params) => tag('link', params)) : []),
                    ...(options.manifest ? [
                        // Points to service worker manifest
                        tag('link', { rel: 'manifest', href: `./${manifestFileNameValue}.webmanifest` }),
                    ] : []),
                    ...(options.index?.scripts ? options.index.scripts.map((params) => tag('script', params)) : []),
                    tag('script', { type: 'text/javascript', name: 'app', src: `/${options.appTargetName.toLowerCase()}.js`, async: '' }, true),
                closeHead(),
                openBody(),
                    ...(options.index?.splash ? [splash(options.index.splash)] : []),
                closeBody(),
            closeHTML()
        ]
        isIndexChanged = true
    }
    // regenerate index.html by replacing only managed lines of code
    else {
        const htmlString = fs.readFileSync(indexPath, 'utf8')
        const htmlLines = htmlString.split('\n')
        var addedMetas = false
        var addedLinks = false
        var addedScripts = false
        for (let i = 0; i < htmlLines.length; i++) {
            const htmlLine = htmlLines[i]
            // <html lang="">
            if (options.index?.lang && htmlLine.startsWith('<html') && htmlLine.includes(managedBy)) {
                const firstSplit = htmlLine.split('lang="')
                const left = firstSplit[0]
                const oldValue = firstSplit[1].split('"')[0]
                if (oldValue == options.index.lang) {
                    lines.push(htmlLine)
                } else {
                    isIndexChanged = true
                    const right = firstSplit[1].split(`${oldValue}"`)[1]
                    lines.push(`${left}lang="${options.index.lang}"${right}`)
                }
            }
            // <title>
            else if (htmlLine.trimStart().startsWith('<title')) {
                // check if it is one-line iframe
                if (htmlLine.trimStart().startsWith('<title') && htmlLine.includes('/title')) {
                    // check if it is managed
                    if (htmlLine.includes(managedBy)) {
                        isIndexChanged = true
                        lines.push(title(options.index?.title ?? '&lrm;'))
                    }
                    // keeping custom title as-is
                    else {
                        lines.push(htmlLine)
                    }
                }
                // scanning multi-line title
                else {
                    var scannedLines: string[] = []
                    var isManaged = false
                    function scan() {
                        // caching line and increasing i variable
                        const htmlLine = htmlLines[i++]
                        scannedLines.push(htmlLine)
                        if (htmlLine.includes(managedBy)) {
                            isManaged = true
                        }
                        // going through scan cycle
                        if (!htmlLine.includes('/title')) {
                            scan()
                        } else {
                            i -= 1
                        }
                    }
                    // start scanning all the lines
                    scan()
                    // if it is managed
                    if (isManaged) {
                        isIndexChanged = true
                        lines.push(title(options.index?.title ?? '&lrm;'))
                    }
                    // keeping custom title as-is
                    else {
                        lines.push(...scannedLines)
                    }
                }
            }
            // <meta>
            else if (htmlLine.trimStart().startsWith('<meta')) {
                // Add managed metas above the others
                if (options.index?.metas && !addedMetas) {
                    addedMetas = true
                    for (let m = 0; m < options.index.metas.length; m++) {
                        // check if same `meta` already present
                        const newMeta = options.index.metas[m]
                        const keys = Object.keys(newMeta)
                        const isCharset = keys.includes('charset')
                        const isViewport = keys.includes('viewport')
                        const isDescription = keys.includes('description')
                        if (isCharset || isViewport || isDescription) {
                            const isManualManaged = htmlLines.filter((x) => {
                                if (!x.trimStart().startsWith('<meta')) return false
                                if (x.includes(managedBy)) return false
                                if (isCharset && x.includes('charset=')) return true
                                if (isViewport && x.includes('viewport=')) return true
                                if (isDescription && x.includes('description=')) return true
                                return false
                            }).length > 0
                            if (!isManualManaged) {
                                lines.push(tag('meta', newMeta))
                            } else {
                                const name = isCharset ? 'charset' : isViewport ? 'viewport' : isDescription ? 'description' : ''
                                print(`💨 index.html skipping <meta ${name}> since it is set manually`, LogLevel.Verbose)
                            }
                        } else {
                            lines.push(tag('meta', newMeta))
                        }
                    }
                }
                if (!htmlLine.includes(managedBy)) {
                    lines.push(htmlLine)
                }
            }
            // <link>
            else if (htmlLine.trimStart().startsWith('<link')) {
                // Add managed links above the others
                if (!addedLinks) {
                    addedLinks = true
                    if (options.index?.links) {
                        for (let l = 0; l < options.index.links.length; l++) {
                            lines.push(tag('link', options.index.links[l]))
                        }
                    }
                    lines.push(tag('link', { rel: 'manifest', href: `./${manifestFileNameValue}.webmanifest` }))
                }
                // Skip old managed links and keep custom
                if (!htmlLine.includes(managedBy)) {
                    lines.push(htmlLine)
                }
            }
            // <script>
            else if (htmlLine.trimStart().startsWith('<script')) {
                // Add managed scripts above the others
                if (!addedScripts) {
                    addedScripts = true
                    if (options.index?.scripts) {
                        for (let s = 0; s < options.index.scripts.length; s++) {
                            lines.push(tag('script', options.index.scripts[s], true))
                        }
                    }
                    lines.push(tag('script', { type: 'text/javascript', name: 'app', src: `/${options.appTargetName.toLowerCase()}.js`, async: true }, true))
                }
                // Skip old managed links and keep custom
                if (!htmlLine.includes(managedBy)) {
                    lines.push(htmlLine)
                }
            }
            // <iframe>
            else if (htmlLine.trimStart().includes('iframe')) {
                // check if it is one-line iframe
                if (htmlLine.trimStart().startsWith('<iframe') && htmlLine.includes('/iframe')) {
                    // check if it is splash
                    if (htmlLine.includes(managedBy) && htmlLine.includes('id="splash"')) {
                        if (options.index?.splash) {
                            lines.push(splash(options.index.splash))
                        }
                    }
                    // keeping custom iframe as-is
                    else {
                        lines.push(htmlLine)
                    }
                }
                // scanning multi-line iframe
                else {
                    var scannedLines: string[] = []
                    var isManaged = false
                    var isSplash = false
                    function scan() {
                        // caching line and increasing i variable
                        const htmlLine = htmlLines[i++]
                        scannedLines.push(htmlLine)
                        if (htmlLine.includes(managedBy)) {
                            isManaged = true
                        }
                        if (htmlLine.includes('id="splash"')) {
                            isSplash = true
                        }
                        // going through scan cycle
                        if (!htmlLine.includes('/iframe')) {
                            scan()
                        } else {
                            i -= 1
                        }
                    }
                    // start scanning all the lines
                    scan()
                    // if it is custom iframe then leave it as-is
                    if (!isManaged) {
                        lines.push(...scannedLines)
                    }
                    // work with managed splash iframe
                    else if (isSplash) {
                        if (options.index?.splash) {
                            lines.push(splash(options.index.splash))
                        }
                    }
                }
            }
            else if (htmlLine.trimStart().startsWith('<body')) {
                if (!htmlString.includes(`id="splash"`)) {
                    if (htmlLine.includes(closeBody().trimStart())) {
                        lines.push(htmlLine.replace(closeBody().trimStart(), ''))
                        lines.push(splash(options.index?.splash))
                        lines.push(closeBody())
                    } else {
                        lines.push(htmlLine)
                        lines.push(splash(options.index?.splash))
                    }
                } else {
                    lines.push(htmlLine)
                }
            }
            // any other element, keeping as is
            else {
                lines.push(htmlLine)
            }
        }
    }
    // writing index.html if needed
    if (isIndexChanged) {
        const newHTML = lines.join('\n')
        fs.writeFileSync(indexPath, newHTML)
    }
    // process html files
    print(`🔄 HTML lastModified: ${lastModifiedDate} current: ${(new Date()).getTime()}`, LogLevel.Unbearable)
    const htmlInSourcesFolder = findFilesRecursively(['html'], webFolder, lastModifiedDate)
    const doesModifiedAnyInSources = htmlInSourcesFolder.filter((x) => x.modified).length > 0
    if (!doesModifiedAnyInSources) {
        print(`💨 Skipping processing HTML files, nothing was modified `, LogLevel.Verbose)
        return
    }
    if (htmlInSourcesFolder.length == 0) {
        measure.finish()
        print(`💨 Skipping HTML files, nothing found in ${measure.time}ms`, LogLevel.Detailed)
        return
    }
    print(`🌎 Processing HTML files`, LogLevel.Detailed)
    for (let i = 0; i < htmlInSourcesFolder.length; i++) {
        const item = htmlInSourcesFolder[i];
        const relativePath = item.path.replace(webFolder, '')
        const saveTo = `${buildFolder}${relativePath}`.replace(item.name, `${item.pureName}.html`)
        const saveToFolderPath = saveTo.split('/').slice(0, -1).join('/')
        if (!fs.existsSync(saveToFolderPath))
            fs.mkdirSync(saveToFolderPath, { recursive: true })
        print(`🌺 Copy HTML file: ${relativePath}`, LogLevel.Verbose)
        buildStatus(`Copy HTML files: ${item.name}`)
        const htmlString = fs.readFileSync(item.path, 'utf8')
        const htmlLines = htmlString.split('\n')
        var lines: string[] = []
        function checkAndReplaceAttribute(line: string, attribute: string): string {
            const toKeep = options.release ? `${attribute}Prod` : `${attribute}Dev`
            const toRemove = options.release ? `${attribute}Dev` : `${attribute}Prod`
            if (line.includes(`${attribute}="`) && line.includes(`${toKeep}="`)) {
                const srcToKeep = line.split(`${toKeep}="`)[1].split('"')[0]
                const src = line.split(`${attribute}="`)[1].split('"')[0]
                line = line.replace(` ${toKeep}="${srcToKeep}"`, '').replace(`${attribute}="${src}"`, `${attribute}="${srcToKeep}"`)
            }
            if (line.includes(`${attribute}="`) && line.includes(`${toRemove}="`)) {
                const path = line.split(`${toRemove}="`)[1].split('"')[0]
                line = line.replace(` ${toRemove}="${path}"`, '')
            }
            return line
        }
        for (let i = 0; i < htmlLines.length; i++) {
            const htmlLine = htmlLines[i]
            // Skip managed lines, proceed only custom
            if (htmlLine.includes(managedBy)) {
                lines.push(htmlLine)
                continue
            }
            // <link>
            if (htmlLine.trimStart().startsWith('<link')) {
                lines.push(checkAndReplaceAttribute(htmlLine, 'href'))
            }
            // <script>
            else if (htmlLine.trimStart().startsWith('<script')) {
                lines.push(checkAndReplaceAttribute(htmlLine, 'src'))
            }
            // keep the rest
            else {
                lines.push(htmlLine)
            }
        }
        let newHTML = lines.join('\n')
        if (indexPath == item.path) {
            newHTML = newHTML.replaceAll(` ${managedBy}`, '').replace('type="text/javascript" name="app"', 'type="text/javascript"')
        }
        fs.writeFileSync(saveTo, newHTML)
    }
    saveLastModifiedDateForKey(LastModifiedDateType.HTML)
    measure.finish()
    print(`🌎 Copied HTML files in ${measure.time}ms`, LogLevel.Detailed)
}
function doctype() {
    return '<!DOCTYPE html>'
}
function openHTML(lang: string) {
    return `<html ${managedBy} lang="${lang}">`
}
function closeHTML() {
    return '</html>'
}
function openHead() {
    return '    <head>'
}
function closeHead() {
    return '    </head>'
}
function openBody() {
    return '    <body>'
}
function closeBody() {
    return '    </body>'
}
function title(title: string) {
    return `        <title ${managedBy}>${title}</title>`
}
function tag(name: string, params: any, closeable: boolean = false) {
    let tag = `        <${name} ${managedBy}`
    const keys = Object.keys(params)
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const value = params[key]
        if (value === true) {
            tag += ` ${key}`
        } else {
            tag += ` ${key}="${value}"`
        }
    }
    return tag + `>` + (closeable ? `</${name}>` : '')
}
function splash(splash: SplashData | undefined) {
    if (!splash) return ''
    const iframeStyle = splash.iframeStyle ?? 'height:100.0%;position:absolute;width:100.0%'
    let tag = `        <iframe ${managedBy} id="splash" style="${iframeStyle}" frameBorder="0" seamless`
    if (splash.pathToFile) {
        return `${tag} src='${splash.pathToFile}'></iframe>`
    } else if (splash.body) {
        const styles = splash.styles.map((v) => atob(v)).join('')
        const scripts = splash.scripts.map((v) => atob(v)).join('')
        const links = splash.links.map((v) => atob(v)).join('')
        const decodedBody = atob(splash.body)
        const html = `<html><head>${styles}${links}${scripts}</head><body>${decodedBody}</body></html>`
        return `${tag} srcdoc='${html}'></iframe>`
    } else {
        return ''
    }
}