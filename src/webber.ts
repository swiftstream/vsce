import { commands, StatusBarAlignment, ThemeColor, window, workspace, debug, DebugSession } from "vscode";
import { Toolchain } from "./toolchain";
import { Project } from "./project";
import { SideTreeItem } from "./sidebarTreeView";
import { defaultDevPort, defaultProdPort, extensionContext, isInContainer, projectDirectory, sidebarTreeView } from "./extension";
import { readPortsFromDevContainer } from "./helpers/readPortsFromDevContainer";
import { createDebugConfigIfNeeded } from "./helpers/createDebugConfigIfNeeded";
import { Swift } from "./swift";
import { NPM } from "./npm";
import { Webpack } from "./webpack";
import { reopenInContainerCommand } from "./commands/reopenInContainer";
import { buildCommand } from "./commands/build";
import { debugInChromeCommand } from "./commands/debugInChrome";
import { hotReloadCommand } from "./commands/hotReload";
import { hotRebuildCommand } from "./commands/hotRebuild";
import { buildReleaseCommand } from "./commands/buildRelease";
import { clearBuildCacheCommand } from "./commands/clearBuildCache";
import { deployToFirebaseCommand } from "./commands/deployToFirebase";
import { loggingLevelCommand } from "./commands/loggingLevel";
import { newFilePageCommand, newFileClassCommand, newFileJSCommand, newFileCSSCommand } from "./commands/newFile";
import { portDevCommand } from "./commands/portDev";
import { portProdCommand } from "./commands/portProd";
import { recompileAppCommand } from "./commands/recompileApp";
import { recompileCSSCommand } from "./commands/recompileCSS";
import { recompileJSCommand } from "./commands/recompileJS";
import { recompileServiceCommand } from "./commands/recompileService";
import { updateSwifWebCommand, updateJSKitCommand } from "./commands/suggestions";
import { documentationCommand, repositoryCommand, discussionsCommand, submitAnIssueCommand } from "./commands/support";
import { toolchainCommand } from "./commands/toolchain";

let output = window.createOutputChannel('SwifWeb')
let problemStatusBarIcon = window.createStatusBarItem(StatusBarAlignment.Left, 0)
let problemStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 0)

export enum LogLevel {
	Normal = 'Normal',
	Detailed = 'Detailed',
	Verbose = 'Verbose'
}

export var isBuilding = false
export var isDebugging = false
export function setDebugging(active: boolean) { isDebugging = active }
export var isHotReloadEnabled = false
export var isHotRebuildEnabled = false
export var isBuildingRelease = false
export var isDeployingToFirebase = false
export var isClearingBuildCache = false
export function setClearingBuildCache(active: boolean) { isClearingBuildCache = active }
export var isClearedBuildCache = false
export function setClearedBuildCache(active: boolean) { isClearedBuildCache = active }
export var isRecompilingApp = false
export var webSourcesPath = 'WebSources'
export var appTargetName = 'App'
export var serviceWorkerTargetName = 'Service'
export var buildDevPath = 'BuildDev'
export var buildProdPath = 'BuildProd'
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
export var pendingNewToolchain: string | undefined
export var currentDevPort: string = `${defaultDevPort}`
export var currentProdPort: string = `${defaultProdPort}`
export var pendingNewDevPort: string | undefined
export var pendingNewProdPort: string | undefined
export var currentLoggingLevel: LogLevel = LogLevel.Normal

export function setPendingNewToolchain(value: string | undefined) {
	if (!isInContainer() && value) {
		currentToolchain = value
		pendingNewToolchain = undefined
	} else {
		pendingNewToolchain = value
	}
	sidebarTreeView?.refresh()
}
export function setPendingNewDevPort(value: string | undefined) {
	if (!isInContainer() && value) {
		currentDevPort = value
		pendingNewDevPort = undefined
	} else {
		pendingNewDevPort = value
	}
	sidebarTreeView?.refresh()
}
export function setPendingNewProdPort(value: string | undefined) {
	if (!isInContainer() && value) {
		currentProdPort = value
		pendingNewProdPort = undefined
	} else {
		pendingNewProdPort = value
	}
	sidebarTreeView?.refresh()
}

export class Webber {
    public toolchain: Toolchain
	public swift: Swift
	public npmWeb: NPM
	public npmJSKit: NPM
	public webpack: Webpack
    project = new Project(this)

    constructor() {
		extensionContext.subscriptions.push(debug.onDidTerminateDebugSession(async (e: DebugSession) => {
			if (e.configuration.type.includes('chrome')) {
				isDebugging = false
				sidebarTreeView?.refresh()
			}
		}))
		this.toolchain = new Toolchain(this)
		this.swift = new Swift(this)
		this.npmWeb = new NPM(this, `${projectDirectory}/${webSourcesPath}`)
		this.npmJSKit = new NPM(this, `${projectDirectory}/.build/.wasi/checkouts/JavaScriptKit`)
		this.webpack = new Webpack(this)
		this._configure()
	}

	private async _configure() {
		if (projectDirectory) {
			const readPorts = await readPortsFromDevContainer()
			currentDevPort = `${readPorts.devPort ?? defaultDevPort}`
			currentProdPort = `${readPorts.prodPort ?? defaultProdPort}`
			createDebugConfigIfNeeded()
			this.setHotReload()
			this.setHotRebuild()
			this.setLoggingLevel()
			this.setWebSourcesPath()
			workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('swifweb.hotReload'))
					this.setHotReload()
				if (event.affectsConfiguration('swifweb.hotRebuild'))
					this.setHotRebuild()
				if (event.affectsConfiguration('swifweb.loggingLevel'))
					this.setLoggingLevel()
				if (event.affectsConfiguration('swifweb.webSourcesPath'))
					this.setWebSourcesPath()
				if (event.affectsConfiguration('swifweb.appTargetName'))
					this.setAppTargetName()
				if (event.affectsConfiguration('swifweb.serviceWorkerTargetName'))
					this.setServiceWorkerTargetName()
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

	setWebSourcesPath(value?: string) {
		webSourcesPath = value ?? workspace.getConfiguration().get('swifweb.webSourcesPath') as string
		if (value) workspace.getConfiguration().update('swifweb.webSourcesPath', value)
		sidebarTreeView?.refresh()
	}

	setAppTargetName(value?: string) {
		appTargetName = value ?? workspace.getConfiguration().get('swifweb.appTargetName') as string
		if (value) workspace.getConfiguration().update('swifweb.appTargetName', value)
		sidebarTreeView?.refresh()
	}

	setServiceWorkerTargetName(value?: string) {
		serviceWorkerTargetName = value ?? workspace.getConfiguration().get('swifweb.serviceWorkerTargetName') as string
		if (value) workspace.getConfiguration().update('swifweb.serviceWorkerTargetName', value)
		sidebarTreeView?.refresh()
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
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DevPort, portDevCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ProdPort, portProdCommand))
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

export function print(message: string, level: LogLevel = LogLevel.Normal, show: boolean | null = null) {
	if (level == LogLevel.Detailed && currentLoggingLevel == LogLevel.Normal)
		return
	if (level == LogLevel.Verbose && [LogLevel.Normal, LogLevel.Detailed].includes(currentLoggingLevel))
		return
	var symbol = ''
	if (level == LogLevel.Detailed)
		symbol = '🟠 '
	if (level == LogLevel.Verbose)
		symbol = '🟣 '
	output.appendLine(`${symbol}${message}`)
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
			const splitted = icon.split('::')
			if (splitted.length == 2) {
				problemStatusBarIcon.text = `$(${splitted[0]})`
				problemStatusBarIcon.color = new ThemeColor(`${splitted[1]}`)
			} else {
				problemStatusBarIcon.text = `$(${icon})`
			}
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
export function buildStatus(text: string) {
	status('sync~spin', text, StatusType.Default)
}