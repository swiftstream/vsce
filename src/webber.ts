import { commands, StatusBarAlignment, ThemeColor, env, window, Uri } from "vscode";
import { Toolchain } from "./toolchain";
import { Project } from "./project";
import { SideTreeItem } from "./sidebarTreeView";
import { extensionContext, sidebarTreeView } from "./extension";

let output = window.createOutputChannel('SwifWeb')
let problemStatusBarIcon = window.createStatusBarItem(StatusBarAlignment.Left, 1001)
let problemStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 1000)

export enum LogLevel {
	Normal = 'Normal',
	Detailed = 'Detailed',
	Verbose = 'Verbose'
}

export var isBuilding = false
export var isDebugging = false
export var isHotReloadEnabled = false
export var isHotRebuildEnabled = false
export var isBuildingRelease = false
export var isDeployingToFirebase = false
export var containsBuildCache = true // TODO:
export var isClearingBuildCache = false
export var isRecompilingApp = false
export var containsService = true // TODO:
export var isRecompilingService = false
export var containsJS = true // TODO:
export var isRecompilingJS = false
export var containsSCSS = true // TODO:
export var isRecompilingSCSS = false
export var containsRecommendations = true // TODO:
export var containsUpdateForSwifweb = true // TODO:
export var containsUpdateForJSKit = true // TODO:
export var currentProjectLabel: string = 'PWA App'
export var currentToolchain: string = `${process.env.S_TOOLCHAIN}`
export var currentPort: string = '8888'
export var currentLoggingLevel: LogLevel = LogLevel.Normal

export class Webber {
    private _toolchain: Toolchain | null = null
    get toolchain(): Toolchain { return this._toolchain || (this._toolchain = new Toolchain(this._currentDirectoryPath)) }
    project = new Project(this)

    get currentDirectoryPath() { return this._currentDirectoryPath }

	constructor(private _currentDirectoryPath: string) {}

    async build(productName: string, release: boolean, tripleWasm: boolean = true) {
		await this.toolchain.build(productName, release, tripleWasm)
	}

	registercommands() {
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ReopenInContainer, reopenInContainerCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Build, buildCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DebugInChrome, debugInChromeCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HotReload, hotReloadCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HotRebuild, hotRebuildCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFilePage, newFilePageCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileClass, newFileClassCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileJS, newFileJSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileSCSS, newFileCSSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.BuildRelease, buildReleaseCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DeployToFirebase, deployToFirebaseCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ClearBuildCache, clearBuildCacheCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileApp, recompileAppCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileService, recompileServiceCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileJS, recompileJSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileCSS, recompileCSSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Toolchain, toolchainCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Port, portCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.LoggingLevel, loggingLevelCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.UpdateSwifWeb, updateSwifWebCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.UpdateJSKit, updateJSKitCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Documentation, documentationCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Repository, repositoryCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Discussions, discussionsCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.SubmitAnIssue, submitAnIssueCommand))
	}
}

// MARK: Print

export function clearPrint() {
	output.clear()
}

export function showOutput() {
	output.show()
}

export function print(message: string, show: boolean | null = null) {
	output.appendLine(message)
	if (show) output.show()
}

// MARK: Status

export enum StatusType {
	Default, Warning, Error
}

export function clearStatus() {
	problemStatusBarIcon.text = ''
	problemStatusBarItem.text = ''
	problemStatusBarIcon.hide()
	problemStatusBarItem.hide()
}

export function status(icon: string | null, message: string, type: StatusType = StatusType.Default, command: string | null = null) {
	if (icon) {
		if (problemStatusBarIcon.text != icon) {
			problemStatusBarIcon.text = `$(${icon})`
			problemStatusBarIcon.show()
		}
	} else {
		problemStatusBarIcon.text = ''
		problemStatusBarIcon.hide()
	}
	problemStatusBarItem.text = message
	switch (type) {
	case StatusType.Default:			
		problemStatusBarIcon.backgroundColor = undefined
		problemStatusBarIcon.color = undefined
		problemStatusBarItem.backgroundColor = undefined
		problemStatusBarItem.color = undefined
		break
	case StatusType.Warning:
		problemStatusBarIcon.backgroundColor = new ThemeColor('statusBarItem.warningBackground')
		problemStatusBarIcon.color = undefined
		problemStatusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground')
		problemStatusBarItem.color = undefined
		break
	case StatusType.Error:
		problemStatusBarIcon.backgroundColor = new ThemeColor('statusBarItem.errorBackground')
		problemStatusBarIcon.color = new ThemeColor('errorForeground')	
		problemStatusBarItem.backgroundColor = new ThemeColor('statusBarItem.errorBackground')
		problemStatusBarItem.color = new ThemeColor('errorForeground')
		break
	}
	problemStatusBarIcon.command = command ?? undefined
	problemStatusBarItem.command = command ?? undefined
	problemStatusBarItem.show()
}

// MARK: Commands

function reopenInContainerCommand() {
	window.showInformationMessage(`reopenInContainerCommand`)

}
function buildCommand() {
	window.showInformationMessage(`buildCommand`)

}
function debugInChromeCommand() {
	window.showInformationMessage(`debugInChromeCommand`)

}
function hotReloadCommand() {
	window.showInformationMessage(`hotReloadCommand`)
	isHotReloadEnabled = !isHotReloadEnabled
	sidebarTreeView?.refresh()
}
function hotRebuildCommand() {
	window.showInformationMessage(`hotRebuildCommand`)
	isHotRebuildEnabled = !isHotRebuildEnabled
	sidebarTreeView?.refresh()
}
function newFilePageCommand() {
	window.showInformationMessage(`newFilePageCommand`)

}
function newFileClassCommand() {
	window.showInformationMessage(`newFileClassCommand`)

}
function newFileJSCommand() {
	window.showInformationMessage(`newFileJSCommand`)

}
function newFileCSSCommand() {
	window.showInformationMessage(`newFileCSSCommand`)

}
function buildReleaseCommand() {
	window.showInformationMessage(`buildReleaseCommand`)

}
function deployToFirebaseCommand() {
	window.showInformationMessage(`deployToFirebaseCommand`)

}
function clearBuildCacheCommand() {
	window.showInformationMessage(`clearBuildCacheCommand`)

}
function recompileAppCommand() {
	window.showInformationMessage(`recompileAppCommand`)

}
function recompileServiceCommand() {
	window.showInformationMessage(`recompileServiceCommand`)

}
function recompileJSCommand() {
	window.showInformationMessage(`recompileJSCommand`)

}
function recompileCSSCommand() {
	window.showInformationMessage(`recompileCSSCommand`)

}
function toolchainCommand() {
	window.showInformationMessage(`toolchainCommand`)

}
function portCommand() {
	window.showInformationMessage(`portCommand`)

}
function loggingLevelCommand() {
	window.showInformationMessage(`loggingLevelCommand`)

}
function updateSwifWebCommand() {
	window.showInformationMessage(`updateSwifWebCommand`)

}
function updateJSKitCommand() {
	window.showInformationMessage(`updateJSKitCommand`)

}
function documentationCommand() {
	window.showInformationMessage(`documentationCommand`)
	env.openExternal(Uri.parse('https://swifweb.com'))
}
function repositoryCommand() {
	env.openExternal(Uri.parse('https://github.com/swifweb'))
}
function discussionsCommand() {
	env.openExternal(Uri.parse('https://github.com/orgs/swifweb/discussions'))
}
function submitAnIssueCommand() {
	env.openExternal(Uri.parse('https://github.com/swifweb/web/issues/new/choose'))
}