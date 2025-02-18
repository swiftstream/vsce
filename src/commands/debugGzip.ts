import * as fs from 'fs'
import path from 'path'
import { projectDirectory, sidebarTreeView, webStream } from "../extension"
import { buildDevFolder, isDebugGzipEnabled } from "../streams/web/webStream"
import { print } from '../streams/stream'
import { LogLevel } from '../streams/stream'

export function debugGzipCommand() {
    const newValue = !isDebugGzipEnabled
    webStream?.setDebugGzip(newValue)
    if (!newValue) {
        const folder = path.join(projectDirectory!, buildDevFolder)
        const files = fs.readdirSync(folder).filter((x) => path.extname(x) == '.gz')
        if (files.length > 0) {
            print(`🧹 Deleted existing .gz files in ${buildDevFolder}`, LogLevel.Verbose)
        }
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            fs.rmSync(path.join(folder, file))
        }
    }
    sidebarTreeView?.refresh()
}