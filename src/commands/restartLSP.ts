import { commands } from 'vscode'
import { currentStream } from '../extension'
import { isRestartingLSP, LogLevel, print, status, StatusType } from '../streams/stream'

export async function restartLSPCommand(silent: boolean = false) {
    if (isRestartingLSP) return
    if (!silent) {
        currentStream?.setRestartingLSP()
    }
    commands.executeCommand('swift.restartLSPServer')
    if (!silent) {
        await new Promise((x) => setTimeout(x, 2000))
        currentStream?.setRestartingLSP(false)
        currentStream?.setRestartedLSP()
        status('check', `Restarted LSP`, StatusType.Success)
        print(`🔧 Restarted LSP`, LogLevel.Detailed)
        await new Promise((x) => setTimeout(x, 1000))
        currentStream?.setRestartedLSP(false)
    }
}