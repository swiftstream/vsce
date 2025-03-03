import * as fs from 'fs'
import path from 'path'
import { projectDirectory, sidebarTreeView, webStream } from '../../../extension'
import { buildDevFolder, isDebugBrotliEnabled } from '../../../streams/web/webStream'
import { print } from '../../../streams/stream'
import { LogLevel } from '../../../streams/stream'

export function debugBrotliCommand() {
    const newValue = !isDebugBrotliEnabled
    webStream?.setDebugBrotli(newValue)
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