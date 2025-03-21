import { commands, window } from 'vscode'
import { isDebuggingInChrome } from '../webStream'
import { sidebarTreeView, webStream } from '../../../extension'
import { webDebugConfig } from '../../../helpers/createDebugConfigIfNeeded'

export async function debugInChromeCommand() {
	if (isDebuggingInChrome) return
	const debugConfig = await webDebugConfig()
	await commands.executeCommand('debug.startFromConfig', debugConfig)
	webStream?.setDebuggingInChrome(true)
	sidebarTreeView?.refresh()
}