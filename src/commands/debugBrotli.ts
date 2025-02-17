import * as fs from 'fs'
import path from 'path'
import { projectDirectory, sidebarTreeView, webber } from "../extension"
import { buildDevFolder, isDebugBrotliEnabled, LogLevel, print } from "../webber"

export function debugBrotliCommand() {
    const newValue = !isDebugBrotliEnabled
    webber?.setDebugBrotli(newValue)
    if (!newValue) {
        const folder = path.join(projectDirectory!, buildDevFolder)
        const files = fs.readdirSync(folder).filter((x) => path.extname(x) == '.br')
        if (files.length > 0) {
            print(`🧹 Deleted existing .br files in ${buildDevFolder}`, LogLevel.Verbose)
        }
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            fs.rmSync(path.join(folder, file))
        }
    }
    sidebarTreeView?.refresh()
}