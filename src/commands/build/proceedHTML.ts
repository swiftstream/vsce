import * as fs from 'fs'
import { projectDirectory } from '../../extension'
import { buildDevPath, buildProdPath, buildStatus, LogLevel, print, webSourcesPath } from '../../webber'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'
import { findFilesRecursively, getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey } from '../../helpers/filesHelper'
import { Index, SplashData } from '../../swift'

const managedBy = `managedBy="SwifWeb"`

export async function proceedHTML(options: { appTargetName: string, manifest?: any, index?: Index, release: boolean }) {
    const measure = new TimeMeasure()
    const lastModifiedDate = getLastModifiedDate(LastModifiedDateType.HTML)
    const webFolder = `${projectDirectory}/${webSourcesPath}`
    const buildFolder = `${projectDirectory}/${options.release ? buildProdPath : buildDevPath}`
    const indexPath = `${webFolder}/index.html`
    const manifestFileNameValue = options.manifest?.file_name ?? 'site'
    var isIndexChanged = false
    var lines: string[] = []
    print(`📜 Manifest present: ${options.manifest ? 'true' : 'false'}`, LogLevel.Unbearable)
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
        const htmlLines = fs.readFileSync(indexPath, 'utf8').split('\n')
        var addedMetas = false
        var addedLinks = false
        var addedScripts = false
        var scanningSplashIframe  = false
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
            else if (htmlLine.trimStart().startsWith('<title') && htmlLine.endsWith('</title>') && htmlLine.includes(managedBy)) {
                const firstSplit = htmlLine.split('>')
                const openingTag = firstSplit[0]
                const oldTitle = firstSplit[1].split('</title>')[0]
                const newTitle = options.index?.title ?? '&lrm;'
                if (oldTitle == newTitle) {
                    lines.push(htmlLine)
                } else {
                    isIndexChanged = true
                    lines.push(`${openingTag}>${newTitle}</title>`)
                }
            }
            // <meta>
            else if (htmlLine.trimStart().startsWith('<meta')) {
                // Add managed metas above the others
                if (options.index?.metas && !addedMetas) {
                    addedMetas = true
                    for (let m = 0; m < options.index.metas.length; m++) {
                        lines.push(tag('meta', options.index.metas[m]))
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
                // found the right <iframe>
                if (htmlLine.trimStart().startsWith('<iframe') && htmlLine.includes(managedBy) && htmlLine.includes('id="splash"')) {
                    // the whole <iframe> is inline
                    if (htmlLine.includes('/iframe') && options.index?.splash) {
                        lines.push(splash(options.index.splash))
                    }
                    // the <iframe> is multiline
                    else {
                        scanningSplashIframe = true
                    }
                }
                // skipping old lines of the <iframe>
                else if (scanningSplashIframe) {
                    // add new if the last line reached
                    if (htmlLine.includes('/iframe')) {
                        lines.push(splash(options.index?.splash))
                    }
                }
                // custom <iframe>, keeping it as is
                else {
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
        print(`🌺 Copy HTML file: ${relativePath}`, LogLevel.Verbose)
        buildStatus(`Copy HTML files: ${item.name}`)
        if (indexPath == item.path) {
            const html = fs.readFileSync(item.path, 'utf8')
                                .replaceAll(` ${managedBy}`, '')
                                .replace('type="text/javascript" name="app"', 'type="text/javascript"')
            fs.writeFileSync(saveTo, html)
        } else {
            fs.copyFileSync(item.path, saveTo)
        }
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