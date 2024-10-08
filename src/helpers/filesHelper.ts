import * as fs from 'fs'
import path from 'path'
import { projectDirectory } from '../extension'

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