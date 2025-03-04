import { commands, window } from 'vscode'
import { createDebugConfigIfNeeded } from '../../../helpers/createDebugConfigIfNeeded'
import { isDebuggingInChrome } from '../webStream'
import { sidebarTreeView, webStream } from '../../../extension'

export async function debugInChromeCommand() {
	if (isDebuggingInChrome) return
	const debugConfig = await createDebugConfigIfNeeded()
	if (debugConfig) {
		await commands.executeCommand('debug.startFromConfig', debugConfig)
		webStream?.setDebuggingInChrome(true)
	} else {
		webStream?.setDebuggingInChrome(false)
		window.showWarningMessage(`Unable to find Chrome launch configuration`)
	}
	sidebarTreeView?.refresh()
}