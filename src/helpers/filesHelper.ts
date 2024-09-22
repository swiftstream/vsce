import * as fs from 'fs'
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

export function wasPathModified(options: { path: string, recursive: boolean, specificExtensions?: string[], lastModifedTimestampMs: number }) {
    if (options.lastModifedTimestampMs == 0) return true
    function checkIfModified(path: string, stat: fs.Stats) {
        const isModified = (
            options.lastModifedTimestampMs < stat.mtimeMs || 
            options.lastModifedTimestampMs < stat.atimeMs || 
            options.lastModifedTimestampMs < stat.ctimeMs
        )
        if (isModified) return true
        function endsWithOneOfExtensions(file: string): boolean {
            if (!options.specificExtensions) return true
            for (const ext in options.specificExtensions)
                if (file.endsWith(ext))
                    return true
            return false
        }
        if (stat.isDirectory() && options.recursive) {
            for (const file in fs.readdirSync(path)) {
                const fp = `${path}/${file}`
                const stat = fs.statSync(fp)
                if ((!stat.isDirectory() && endsWithOneOfExtensions(file)) && checkIfModified(fp, stat))
                    return true
            }
            return false
        } else return isModified
    }
    return checkIfModified(options.path, fs.statSync(options.path))
}

// MARK: Build Timestamps

function buildTimestampsPath(): string {
    return `${projectDirectory}/.vscode/.buildTimestamps.json`
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
    WebSources = 'webSources'
}

export function getLastModifiedDate(key: LastModifiedDateType, subkey: string = ''): number {
    return getLastModifiedDates()[`${key}${subkey}`] ?? 0
}

export function saveLastModifiedDateForKey(key: LastModifiedDateType, subkey: string = '') {
    var data = getLastModifiedDates()
    data[`${key}${subkey}`] = (new Date()).getTime()
    fs.writeFileSync(buildTimestampsPath(), JSON.stringify(data, null, '\t'))
}