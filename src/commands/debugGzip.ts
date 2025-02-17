import * as fs from 'fs'
import path from 'path'
import { projectDirectory, sidebarTreeView, webber } from "../extension"
import { buildDevFolder, isDebugGzipEnabled, LogLevel, print } from "../webber"

export function debugGzipCommand() {
    const newValue = !isDebugGzipEnabled
    webber?.setDebugGzip(newValue)
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