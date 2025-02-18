import { window } from "vscode"
import { LogLevel } from '../streams/stream'
import { currentLoggingLevel } from '../streams/stream'
import { sidebarTreeView, currentStream } from "../extension"

export async function loggingLevelCommand() {
	const newLoggingLevel = await window.showQuickPick([
		LogLevel.Normal,
		LogLevel.Detailed,
		LogLevel.Verbose,
		LogLevel.Unbearable
	], {
		title: currentLoggingLevel,
		placeHolder: 'Select new logging level'
	})
	currentStream?.setLoggingLevel(newLoggingLevel as LogLevel)
	sidebarTreeView?.refresh()
}