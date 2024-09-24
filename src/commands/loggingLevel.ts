import { window } from "vscode"
import { currentLoggingLevel, LogLevel } from "../webber"
import { sidebarTreeView, webber } from "../extension"

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
	webber?.setLoggingLevel(newLoggingLevel as LogLevel)
	sidebarTreeView?.refresh()
}