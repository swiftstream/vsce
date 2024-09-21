import * as fs from 'fs'
import { projectDirectory } from '../extension'

export function isFolder(path: string) {
    return fs.statSync(path).isDirectory()
}

export function listFilesInFolder(path: string) {
    return fs.readdirSync(path)
}

export function wasFileChanged(path: string, lastModifedTimestampMs: number) {
    const stat = fs.statSync(path)
    return (
        lastModifedTimestampMs < stat.mtimeMs || 
        lastModifedTimestampMs < stat.atimeMs || 
        lastModifedTimestampMs < stat.ctimeMs
    )
}

// MARK: Build Timestamps

function buildTimestampsPath(): string {
    return `${projectDirectory}/.vscode/.buildTimestamps.json`
}

export function getLastModifiedDates(): any {
    try {
        return JSON.stringify(fs.readFileSync(buildTimestampsPath()))
    } catch (error) {
        return {}
    }
}

export function saveLastModifiedDateForKey(key: string) {
    var data = getLastModifiedDates()
    data[key] = (new Date()).getTime()
    fs.writeFileSync(buildTimestampsPath(), JSON.stringify(data))
}