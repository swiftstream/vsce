import { commands, StatusBarAlignment, ThemeColor, env, window, Uri, workspace, debug, DebugSession, extensions } from "vscode";
import { Toolchain } from "./toolchain";
import { Project } from "./project";
import { SideTreeItem } from "./sidebarTreeView";
import { defaultPort, extensionContext, isInContainer, projectDirectory, sidebarTreeView, webber } from "./extension";
import { readPortFromDevContainer } from "./helpers/readPortFromDevContainer";
import { createDebugConfigIfNeeded } from "./helpers/createDebugconfigIfNeeded";
import * as fs from 'fs'

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
export var isClearingBuildCache = false
export var isClearedBuildCache = false
export var isRecompilingApp = false
export var containsService = true // TODO: check if contains service
export var isRecompilingService = false
export var containsJS = true // TODO: check if contains JS
export var isRecompilingJS = false
export var containsSCSS = true // TODO: check if contains SCSS
export var isRecompilingSCSS = false
export var containsRecommendations = true // TODO: check if contains any recommendations
export var containsUpdateForSwifweb = true // TODO: check if SwifWeb could be updated
export var containsUpdateForJSKit = true // TODO: check if JSKit could be updated
export var currentToolchain: string = `${process.env.S_TOOLCHAIN}`
export var currentPort: string = `${defaultPort}` // reads from devcontainer.json
export var pendingNewPort: string | undefined
export var currentLoggingLevel: LogLevel = LogLevel.Normal

export function setPendingNewPort(value: string | undefined) {
	if (!isInContainer() && value) {
		currentPort = value
		pendingNewPort = undefined
	} else {
		pendingNewPort = value
	}
	sidebarTreeView?.refresh()
}

export class Webber {
    private _toolchain: Toolchain | null = null
    get toolchain(): Toolchain { return this._toolchain || (this._toolchain = new Toolchain()) }
    project = new Project(this)

    constructor() {
		extensionContext.subscriptions.push(debug.onDidTerminateDebugSession(async (e: DebugSession) => {
			if (e.configuration.type.includes('chrome')) {
				isDebugging = false
				sidebarTreeView?.refresh()
			}
		}))
		this._configure()
	}

	private async _configure() {
		if (projectDirectory) {
			currentPort = `${await readPortFromDevContainer() ?? defaultPort}`
			createDebugConfigIfNeeded()
			this.setHotReload()
			this.setHotRebuild()
			this.setLoggingLevel()
			workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('swifweb.hotReload'))
					this.setHotReload()
				if (event.affectsConfiguration('swifweb.hotRebuild'))
					this.setHotRebuild()
				if (event.affectsConfiguration('swifweb.loggingLevel'))
					this.setLoggingLevel()
			})
		}
	}

	setHotReload(value?: boolean) {
		isHotReloadEnabled = value ?? workspace.getConfiguration().get('swifweb.hotReload') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('swifweb.hotReload', value)
		sidebarTreeView?.refresh()
	}

	setHotRebuild(value?: boolean) {
		isHotRebuildEnabled = value ?? workspace.getConfiguration().get('swifweb.hotRebuild') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('swifweb.hotRebuild', value)
		sidebarTreeView?.refresh()
	}

	setLoggingLevel(value?: LogLevel) {
		currentLoggingLevel = value ?? workspace.getConfiguration().get('swifweb.loggingLevel') as LogLevel
		if (value) workspace.getConfiguration().update('swifweb.loggingLevel', value)
		sidebarTreeView?.refresh()
	}

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

async function reopenInContainerCommand() {
	if (!projectDirectory) {
		window.showInformationMessage('Please open project folder first')
		return
	}
	const folderUri: Uri = Uri.parse(projectDirectory)
	const extension = extensions.getExtension('ms-vscode-remote.remote-containers')
    if (!extension) {
		const res = await window.showInformationMessage(`You have to install Dev Containers extension first`, 'Install', 'Cancel')
		if (res == 'Install') {
			env.openExternal(Uri.parse('vscode:extension/ms-vscode-remote.remote-containers'))
		}
		return
	}
	try {
		if (!extension.isActive) { await extension.activate() }
		commands.executeCommand('remote-containers.openFolder', folderUri)
		commands.executeCommand('remote-containers.revealLogTerminal')
	} catch (error: any) {
		window.showErrorMessage(`Unexpected error has occured: ${error.toString()}`)
	}
}
function buildCommand() {
	window.showInformationMessage(`buildCommand`)

}
async function debugInChromeCommand() {
	if (isDebugging) return
	const debugConfig = await createDebugConfigIfNeeded()
	if (debugConfig) {
		await commands.executeCommand('debug.startFromConfig', debugConfig)
		isDebugging = true
	} else {
		isDebugging = false
		window.showWarningMessage(`Unable to find Chrome launch configuration`)
	}
	sidebarTreeView?.refresh()
}
function hotReloadCommand() {
	webber?.setHotReload(!isHotReloadEnabled)
	sidebarTreeView?.refresh()
}
function hotRebuildCommand() {
	webber?.setHotRebuild(!isHotRebuildEnabled)
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
	if (isClearingBuildCache || isClearedBuildCache) return
	isClearingBuildCache = true
	sidebarTreeView?.refresh()
	const buildFolder = `${projectDirectory}/.build`
	const startTime = new Date()
	if (fs.existsSync(buildFolder)) {
		fs.rmdirSync(buildFolder, { recursive: true })
	}
	const endTime = new Date()
	function afterClearing() {
		isClearingBuildCache = false
		isClearedBuildCache = true
		sidebarTreeView?.refresh()
		setTimeout(() => {
			isClearedBuildCache = false
			sidebarTreeView?.refresh()
		}, 1000)
	}
	if (endTime.getTime() - startTime.getTime() < 1000) {
		setTimeout(() => {
			afterClearing()
		}, 1000)
	} else {
		afterClearing()
	}
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
async function portCommand() {
	const port = await window.showInputBox({
		value: `${currentPort}`,
		placeHolder: 'Please select another port',
		validateInput: text => {
			const value = parseInt(text)
			if (value < 80)
				return 'Should be >= 80'
			if (value > 65534)
				return 'Should be < 65535'
			return isNaN(parseInt(text)) ? 'Port should be a number' : null
		}
	})
	if (port == currentPort) return
	const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
	var devContainerContent: string = fs.readFileSync(devContainerPath, 'utf8')
	if (devContainerContent) {
		const stringToReplace = `"appPort": ["${currentPort}:443"],`
		if (!devContainerContent.includes(stringToReplace)) {
			const res = await window.showErrorMessage(`Port doesn't match in devcontainer.json`, 'Edit manually', 'Cancel')
			if (res == 'Edit manually') {
				const doc = await workspace.openTextDocument(Uri.parse(devContainerPath))
				await window.showTextDocument(doc, 1, false)
				var appPortLine = 0
				for (var i=0; i<doc.lineCount; i++) {
					if (doc.lineAt(i).text.includes(`"appPort"`))
						appPortLine = i
				}
				await commands.executeCommand('cursorMove', {
						to: 'up', by:'wrappedLine', value: doc.lineCount
				})
				await commands.executeCommand('cursorMove', {
					to: 'down', by: 'wrappedLine', value: appPortLine
				})
			}
			return
		}
		devContainerContent = devContainerContent.replace(stringToReplace, `"appPort": ["${port}:443"],`)
		fs.writeFileSync(devContainerPath, devContainerContent)
		setPendingNewPort(`${port}`)
	}
}
async function loggingLevelCommand() {
	const newLoggingLevel = await window.showQuickPick([
		LogLevel.Normal,
		LogLevel.Detailed,
		LogLevel.Verbose
	], {
		title: currentLoggingLevel,
		placeHolder: 'Select new logging level'
	})
	webber?.setLoggingLevel(newLoggingLevel as LogLevel)
	sidebarTreeView?.refresh()
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