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

export function wasPathModified(options: { path: string, recursive: boolean, lastModifedTimestampMs: number }) {
    if (options.lastModifedTimestampMs == 0) return true
    function checkIfModified(path: string) {
        const stat = fs.statSync(path)
        const isModified = (
            options.lastModifedTimestampMs < stat.mtimeMs || 
            options.lastModifedTimestampMs < stat.atimeMs || 
            options.lastModifedTimestampMs < stat.ctimeMs
        )
        if (isModified) return true
        if (stat.isDirectory() && options.recursive) {
            for (const file in fs.readdirSync(path))
                if (checkIfModified(`${path}/${file}`))
                    return true
            return false
        } else return isModified
    }
    return checkIfModified(options.path)
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
    JavaScriptKitPackage = 'JavaScriptKitPackage'
}

export function getLastModifiedDate(key: LastModifiedDateType, subkey: string = ''): number {
    return getLastModifiedDates()[`${key}${subkey}`] ?? 0
}

export function saveLastModifiedDateForKey(key: LastModifiedDateType, subkey: string = '') {
    var data = getLastModifiedDates()
    data[`${key}${subkey}`] = (new Date()).getTime()
    fs.writeFileSync(buildTimestampsPath(), JSON.stringify(data))
}