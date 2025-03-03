import { commands, window } from 'vscode'
import { createDebugConfigIfNeeded } from '../../../helpers/createDebugConfigIfNeeded'
import { isDebugging } from '../webStream'
import { sidebarTreeView, webStream } from '../../../extension'

export async function debugInChromeCommand() {
	if (isDebugging) return
	const debugConfig = await createDebugConfigIfNeeded()
	if (debugConfig) {
		await commands.executeCommand('debug.startFromConfig', debugConfig)
		webStream?.setDebugging(true)
	} else {
		webStream?.setDebugging(false)
		window.showWarningMessage(`Unable to find Chrome launch configuration`)
	}
	sidebarTreeView?.refresh()
}