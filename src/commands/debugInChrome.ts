import { commands, window } from "vscode"
import { createDebugConfigIfNeeded } from "../helpers/createDebugConfigIfNeeded"
import { isDebugging, setDebugging } from "../webber"
import { sidebarTreeView } from "../extension"

export async function debugInChromeCommand() {
	if (isDebugging) return
	const debugConfig = await createDebugConfigIfNeeded()
	if (debugConfig) {
		await commands.executeCommand('debug.startFromConfig', debugConfig)
		setDebugging(true)
	} else {
		setDebugging(false)
		window.showWarningMessage(`Unable to find Chrome launch configuration`)
	}
	sidebarTreeView?.refresh()
}