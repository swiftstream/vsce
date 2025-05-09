import * as fs from 'fs'
import * as crypto from 'crypto'
import path from 'path'
import { Uri, window } from 'vscode'
import { projectDirectory, extensionContext } from '../extension'

export const isWin = process.platform == 'win32'

export async function copyFile(
    sourcePath: string,
    destPath: string
): Promise<boolean> {
    try {
        if (isWin) {
            fs.cpSync(Uri.file(extensionContext.asAbsolutePath(sourcePath)).fsPath, destPath, { force: true })
        } else {
            fs.cpSync(Uri.file(extensionContext.asAbsolutePath(sourcePath)).path, destPath, { force: true })
        }
        return true
    } catch (err) {
        window.showErrorMessage(`${err?.toString()}`)
        return false
    }
}

export function readFile(sourcePath: string): string {
    return fs.readFileSync(Uri.file(extensionContext.asAbsolutePath(sourcePath)).path, 'utf8')
}

export function isFolder(path: string) {
    return fs.statSync(path).isDirectory()
}

export function listFilesInFolder(path: string) {
    return fs.readdirSync(path)
}

export function wasFileModified(options: { path: string, lastModifedTimestampMs: number }) {
    if (options.lastModifedTimestampMs == 0) return true
    const stat = fs.statSync(options.path)
    return (
        options.lastModifedTimestampMs < stat.mtimeMs || 
        options.lastModifedTimestampMs < stat.atimeMs || 
        options.lastModifedTimestampMs < stat.ctimeMs
    )
}

export function endsWithOneOfExtensions(file: string, extensions: string[] | undefined): boolean {
    if (!extensions) return true
    for (let i = 0; i < extensions.length; i++) {
        const ext = extensions[i]
        if (file.endsWith(ext))
            return true
    }
    return false
}

export function wasPathModified(options: { path: string, recursive: boolean, specificExtensions?: string[], exclude?: string[], lastModifedTimestampMs: number }) {
    if (options.lastModifedTimestampMs == 0) return true
    function checkIfModified(path: string, stat: fs.Stats) {
        const isModified = (
            options.lastModifedTimestampMs < stat.mtimeMs || 
            options.lastModifedTimestampMs < stat.atimeMs || 
            options.lastModifedTimestampMs < stat.ctimeMs
        )
        if (isModified) return true
        if (stat.isDirectory() && options.recursive) {
            const files = fs.readdirSync(path)
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                if (options.exclude && options.exclude.includes(file))
                    continue
                const fp = `${path}/${file}`
                const stat = fs.statSync(fp)
                if ((!stat.isDirectory() && endsWithOneOfExtensions(file, options.specificExtensions)) && checkIfModified(fp, stat))
                    return true
            }
            return false
        } else return isModified
    }
    return checkIfModified(options.path, fs.statSync(options.path))
}

// MARK: Build Timestamps

function buildTimestampsPath(): string {
    return `${projectDirectory}/.build/buildTimestamps.json`
}

function getLastModifiedDates(): any {
    try {
        return JSON.parse(fs.readFileSync(buildTimestampsPath(), 'utf8'))
    } catch (error) {
        return {}
    }
}

export enum LastModifiedDateType {
    SwiftPackage = 'swiftPackage',
    SwiftSources = 'swiftSources',
    JavaScriptKitPackage = 'JavaScriptKitPackage',
    WebSources = 'webSources',
    SCSS = 'SCSS',
    HTML = 'HTML'
}

export function getLastModifiedDate(key: LastModifiedDateType, subkey: string = ''): number {
    return getLastModifiedDates()[`${key}${subkey.length > 0 ? '_' : ''}${subkey}`] ?? 0
}

export function saveLastModifiedDateForKey(key: LastModifiedDateType, subkey: string = '') {
    var data = getLastModifiedDates()
    data[`${key}${subkey.length > 0 ? '_' : ''}${subkey}`] = (new Date()).getTime()
    fs.writeFileSync(buildTimestampsPath(), JSON.stringify(data, null, '\t'))
}

export interface FoundFileItem {
    name: string,
    pureName: string,
    path: string,
    folder: string,
    modified: boolean
}
export function findFilesRecursively(extensions: string[], folder: string, lastModifedTimestampMs: number): FoundFileItem[] {
    var items: FoundFileItem[] = []
    const excluded: string[] = ['node_modules']
    const folderItems = fs.readdirSync(folder)
    for (let itemIndex = 0; itemIndex < folderItems.length; itemIndex++) {
        const item = folderItems[itemIndex]
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
            items = [...items, ...findFilesRecursively(extensions, itemPath, lastModifedTimestampMs)]
        } else if (endsWithOneOfExtensions(item, extensions)) {
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

/// Credits to https://stackoverflow.com/a/14919494/1001057
export function humanFileSize(bytes: number, si: boolean = false, dp: number = 1) {
    const thresh = si ? 1000 : 1024
    if (Math.abs(bytes) < thresh) {
        return bytes + ' B'
    }
    const units = si 
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] 
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
    let u = -1
    const r = 10**dp
    do {
        bytes /= thresh
        ++u
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1)
    return bytes.toFixed(dp) + ' ' + units[u]
}

/// Credits to https://gist.github.com/zfael/a1a6913944c55843ed3e999b16350b50
export function generateChecksum(str: string): string {
    return crypto
        .createHash('md5')
        .update(str, 'utf8')
        .digest('hex')
}