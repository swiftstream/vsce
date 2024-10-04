import * as fs from 'fs'
import { projectDirectory, webber } from '../../extension'
import { webSourcesPath } from '../../webber'

const managedBy = `managedBy="SwifWeb"`

export async function proceedHTML(options: { appTargetName: string, manifest?: any, splash?: string }) {
    const indexPath = `${projectDirectory}/${webSourcesPath}/index.html`
    const langValue = 'en-US'
    const titleValue = '&lrm;'
    const charsetValue = 'utf-8'
    const viewportValue = 'width=device-width; initial-scale=1; viewport-fit=cover, user-scalable=no'
    const descriptionValue = ''
    const mobileWebAppCapableValue = 'yes'
    const appleMobileWebAppStatusBarStyleValue = options.manifest.theme_color
    const themeColorValue = options.manifest.theme_color
    const msApplicationNavbuttonColor = options.manifest.theme_color
    const manifestFileNameValue = options.manifest?.file_name ?? 'site'
    var lines: string[] = []
    // generate HTML from scratch
    if (!fs.existsSync(indexPath)) {
        lines = [
            doctype(),
            openHTML(langValue),
                openHead(),
                    title(titleValue),
                    charset(charsetValue),
                    meta('viewport', viewportValue),
                    meta('description', descriptionValue),
                    ...(options.manifest ? [
                        meta('mobile-web-app-capable', mobileWebAppCapableValue),
                        meta('apple-mobile-web-app-capable', mobileWebAppCapableValue),
                        // <!-- iOS Safari: possible content values: default, black or black-translucent, hex -->
                        meta('apple-mobile-web-app-status-bar-style', `${appleMobileWebAppStatusBarStyleValue}`),
                        // <!-- Chrome, Firefox OS and Opera -->
                        meta('theme-color', `${themeColorValue}`),
                        // <!-- Windows Phone -->
                        meta('msapplication-navbutton-color', `${msApplicationNavbuttonColor}`),
                        link('manifest', `./${manifestFileNameValue}.webmanifest`),
                    ] : []),
                    script('text/javascript', 'app', `/${options.appTargetName.toLowerCase()}.js`, true),
                closeHead(),
                openBody(),
                    splash(options.splash),
                closeBody(),
            closeHTML()
        ]
    }
    // change existing HTML line by line between special boundaires
    else {
        const htmlLines = fs.readFileSync(indexPath, 'utf8').split('\n')
        for (let i = 0; i < htmlLines.length - 1; i++) {
            const htmlLine = htmlLines[i]
            if (htmlLine.startsWith('<html') && htmlLine.includes(managedBy)) {
                const firstSplit = htmlLine.split('lang="')
                const left = firstSplit[0]
                const oldValue = firstSplit[1].split('"')[0]
                if (oldValue == langValue) {
                    lines.push(htmlLine)
                } else {
                    const right = firstSplit[1].split(`${oldValue}"`)[1]
                    lines.push(`${left}lang="${langValue}"${right}`)
                }
            } else if (htmlLine.trimStart().startsWith('<meta') && htmlLine.includes('charset') && htmlLine.includes(managedBy)) {
                lines.push(charset(charsetValue))
            } else if (htmlLine.trimStart().startsWith('<meta') && htmlLine.includes('name="viewport"') && htmlLine.includes(managedBy)) {
                lines.push(meta('viewport', viewportValue))
            } else if (htmlLine.trimStart().startsWith('<meta') && htmlLine.includes('name="description"') && htmlLine.includes(managedBy)) {
                lines.push(meta('description', descriptionValue))
            } else if (htmlLine.trimStart().startsWith('<meta') && htmlLine.includes('name="mobile-web-app-capable"') && htmlLine.includes(managedBy)) {
                lines.push(meta('mobile-web-app-capable', mobileWebAppCapableValue))
            } else if (htmlLine.trimStart().startsWith('<meta') && htmlLine.includes('name="apple-mobile-web-app-capable"') && htmlLine.includes(managedBy)) {
                lines.push(meta('apple-mobile-web-app-capable', mobileWebAppCapableValue))
            } else if (htmlLine.trimStart().startsWith('<meta') && htmlLine.includes('name="apple-mobile-web-app-status-bar-style"') && htmlLine.includes(managedBy)) {
                lines.push(meta('apple-mobile-web-app-status-bar-style', `${appleMobileWebAppStatusBarStyleValue}`))
            } else if (htmlLine.trimStart().startsWith('<meta') && htmlLine.includes('name="theme-color"') && htmlLine.includes(managedBy)) {
                lines.push(meta('theme-color', `${themeColorValue}`))
            } else if (htmlLine.trimStart().startsWith('<meta') && htmlLine.includes('name="msapplication-navbutton-color"') && htmlLine.includes(managedBy)) {
                lines.push(meta('msapplication-navbutton-color', `${msApplicationNavbuttonColor}`))
            } else if (htmlLine.trimStart().startsWith('<link') && htmlLine.includes('rel="manifest"') && htmlLine.includes(managedBy)) {
                lines.push(link('manifest', `./${manifestFileNameValue}`))
            } else if (htmlLine.trimStart().startsWith('<script') && htmlLine.includes('name="app"') && htmlLine.includes(managedBy)) {
                lines.push(script('text/javascript', 'app', `/${options.appTargetName.toLowerCase()}.js`, true))
            } else if (htmlLine.trimStart().startsWith('<iframe') && htmlLine.includes('id="splash"') && htmlLine.includes(managedBy)) {
                lines.push(splash(options.splash))
            } else if (htmlLine.trimStart().startsWith('<title') && htmlLine.endsWith('</title>') && htmlLine.includes(managedBy)) {
                const firstSplit = htmlLine.split('>')
                const openingTag = firstSplit[0]
                const oldTitle = firstSplit[1].split('</title>')[0]
                if (oldTitle == titleValue) {
                    lines.push(htmlLine)
                } else {
                    lines.push(`${openingTag}>${titleValue}</title>`)
                }
            } else {
                lines.push(htmlLine)
            }
        }
    }
    const newHTML = lines.join('/n')
    fs.writeFileSync(indexPath, newHTML)
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
function charset(charset: string) {
    return `        <meta ${managedBy} charset="${charset}" />`
}
function meta(name: string, content: string) {
    return `        <meta ${managedBy} name="${name}" content="${content}">`
}
function link(rel: string, href: string) {
    return `        <link ${managedBy} rel="${rel}" href="${href}">`
}
function script(type: string, name: string, src: string, async: boolean) {
    return `        <script ${managedBy} type="${type}" name="${name}" src="${src}"${async ? ' async' : ''}></script>`
}
function splash(splash: string | undefined) {
    if (!splash) return ''
    return `        <iframe ${managedBy} id="splash" style="height:100.0%;position:absolute;width:100.0%" frameBorder="0" seamless srcdoc='${splash}'></iframe>`
}