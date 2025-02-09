import * as fs from 'fs'
import { commands, StatusBarAlignment, ThemeColor, window, workspace, debug, DebugSession, FileRenameEvent, FileDeleteEvent } from "vscode";
import { Toolchain } from "./toolchain";
import { SideTreeItem } from "./sidebarTreeView";
import { defaultWebDevPort, defaultWebProdPort, extensionContext, isInContainer, projectDirectory, sidebarTreeView, webber } from "./extension";
import { readPortsFromDevContainer } from "./helpers/readPortsFromDevContainer";
import { createDebugConfigIfNeeded } from "./helpers/createDebugConfigIfNeeded";
import { Swift } from "./swift";
import { NPM } from "./npm";
import { Webpack } from "./webpack";
import { reopenInContainerCommand, whyReopenInContainerCommand } from "./commands/reopenInContainer";
import { buildCommand, cachedSwiftTargets, hotRebuildCSS, hotRebuildHTML, hotRebuildJS, hotRebuildSwift } from "./commands/build";
import { debugInChromeCommand } from "./commands/debugInChrome";
import { hotReloadCommand } from "./commands/hotReload";
import { hotRebuildCommand } from "./commands/hotRebuild";
import { buildReleaseCommand } from "./commands/buildRelease";
import { clearBuildCacheCommand } from "./commands/clearBuildCache";
import { loggingLevelCommand } from "./commands/loggingLevel";
import { newFilePageCommand, newFileClassCommand, newFileJSCommand, newFileCSSCommand } from "./commands/newFile";
import { portDevCommand } from "./commands/portDev";
import { portProdCommand } from "./commands/portProd";
import { updateWebCommand, updateJSKitCommand } from "./commands/suggestions";
import { repositoryCommand, discussionsCommand, submitAnIssueCommand, webDocumentationCommand, androidDocumentationCommand, vaporDocumentationCommand, hummingbirdDocumentationCommand, serverDocumentationCommand } from "./commands/support";
import { toolchainCommand } from "./commands/toolchain";
import { Gzip } from "./gzip";
import { Bash } from "./bash";
import { Wasm } from "./wasm";
import { CrawlServer } from './crawlServer';
import { startNewProjectWizard } from './wizards/startNewProjectWizard';
import { Firebase } from './clouds/firebase';
import { FlyIO } from './clouds/flyio';

let output = window.createOutputChannel('SwiftStream')
let problemStatusBarIcon = window.createStatusBarItem(StatusBarAlignment.Left, 0)
let problemStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 0)

export enum LogLevel {
	Normal = 'Normal',
	Detailed = 'Detailed',
	Verbose = 'Verbose',
	Unbearable = 'Unbearable'
}

export var isBuilding = false
export var abortBuilding: (() => void) | undefined
export function setAbortBuilding(handler: () => void | undefined) {
	abortBuilding = handler
}
export var isHotBuildingCSS = false
export var isHotBuildingJS = false
export var isHotBuildingHTML = false
export var isHotBuildingSwift = false
export var isAnyHotBuilding: () => boolean = () => {
	return isHotBuildingCSS || isHotBuildingJS || isHotBuildingHTML || isHotBuildingSwift
}
export function setBuilding(active: boolean) {
	if (!active) abortBuilding = undefined
	isBuilding = active
	commands.executeCommand('setContext', 'isBuilding', active)
}
export function setHotBuildingCSS(active: boolean) {
	isHotBuildingCSS = active
	isRecompilingCSS = active
}
export function setHotBuildingJS(active: boolean) {
	isHotBuildingJS = active
	isRecompilingJS = active
}
export function setHotBuildingHTML(active: boolean) {
	isHotBuildingHTML = active
	isRecompilingHTML = active
}
export function setHotBuildingSwift(active: boolean) {
	isHotBuildingSwift = active
	if (!active) {
		isRecompilingApp = false
		isRecompilingService = false
	}
}
export var isDebugging = false
export function setDebugging(active: boolean) {
	isDebugging = active
	commands.executeCommand('setContext', 'isDebugging', active)
}
export var isHotReloadEnabled = false
export var isHotRebuildEnabled = false
export var isBuildingRelease = false
export var abortBuildingRelease: (() => void) | undefined
export function setAbortBuildingRelease(handler: () => void | undefined) {
	abortBuildingRelease = handler
}
export function setBuildingRelease(active: boolean) {
	if (!active) abortBuildingRelease = undefined
	isBuildingRelease = active
	commands.executeCommand('setContext', 'isBuildingRelease', active)
}
export var isRunningCrawlServer = false
export function setRunningCrawlServer(active: boolean) {
	isRunningCrawlServer = active
}
export var isClearingBuildCache = false
export function setClearingBuildCache(active: boolean) { isClearingBuildCache = active }
export var isClearedBuildCache = false
export function setClearedBuildCache(active: boolean) { isClearedBuildCache = active }
export var indexFile = 'main.html'
export var webSourcesFolder = 'WebSources'
export var appTargetName = 'App'
export var serviceWorkerTargetName = 'Service'
export var buildDevFolder = 'DevPublic'
export var buildProdFolder = 'DistPublic'
export var containsAppTarget = async () => {
	if (!webber) return false
	const targetsDump = cachedSwiftTargets ?? await webber.swift.getTargets()
	return targetsDump.executables.includes(appTargetName)
}
export var canRecompileAppTarget = () => {
	return fs.existsSync(`${projectDirectory}/.build/debug/${appTargetName}`)
}
export var containsServiceTarget = async () => {
	if (!webber) return false
	const targetsDump = cachedSwiftTargets ?? await webber.swift.getTargets()
	return targetsDump.serviceWorkers.includes(serviceWorkerTargetName)
}
export var canRecompileServiceTarget = () => {
	return fs.existsSync(`${projectDirectory}/.build/debug/${serviceWorkerTargetName}`)
}
export var isRecompilingApp = false
export function setRecompilingApp(active: boolean) { isRecompilingApp = active }
export var isRecompilingService = false
export function setRecompilingService(active: boolean) { isRecompilingService = active }
export var isRecompilingJS = false
export var isRecompilingCSS = false
export var isRecompilingHTML = false
export var containsRecommendations = true // TODO: check if contains any recommendations
export var containsUpdateForWeb = true // TODO: check if Web could be updated
export var containsUpdateForJSKit = true // TODO: check if JSKit could be updated
export var currentToolchain: string = `${getToolchainNameFromURL()}`
export var pendingNewToolchain: string | undefined
export var currentDevPort: string = `${defaultWebDevPort}`
export var currentProdPort: string = `${defaultWebProdPort}`
export var pendingNewDevPort: string | undefined
export var pendingNewProdPort: string | undefined
export var currentLoggingLevel: LogLevel = LogLevel.Normal
export function getToolchainNameFromURL(url: string | undefined = undefined): string | undefined {
	const value: string | undefined = url ?? process.env.S_TOOLCHAIN_URL_X86
	if (!value) return 'undefined'
	return value.split('/').pop()
		?.replace(/^swift-/, '')
		.replace(/(\.tar\.gz|\.zip)$/, '')
		.replace(/(-ubuntu20\.04|-aarch64|_x86_64|_aarch64|-a)/g, '')
}

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
    public bash: Bash
	public toolchain: Toolchain
	public swift: Swift
	public npmWeb: NPM
	public npmJSKit: NPM
	public webpack: Webpack
	public wasm: Wasm
	public gzip: Gzip
	public crawlServer: CrawlServer

	// Cloud providers
	public firebase: Firebase
	public flyio: FlyIO
    constructor() {
		extensionContext.subscriptions.push(debug.onDidTerminateDebugSession(async (e: DebugSession) => {
			if (e.configuration.type.includes('chrome')) {
				setDebugging(false)
				sidebarTreeView?.refresh()
			}
		}))
		this.bash = new Bash()
		this.toolchain = new Toolchain(this)
		this.swift = new Swift(this)
		this.npmWeb = new NPM(this, `${projectDirectory}/${webSourcesFolder}`)
		this.npmJSKit = new NPM(this, `${projectDirectory}/.build/.wasi/checkouts/JavaScriptKit`)
		this.webpack = new Webpack(this)
		this.wasm = new Wasm(this)
		this.gzip = new Gzip(this)
		this.crawlServer = new CrawlServer(this)
		this.firebase = new Firebase(this)
		this.flyio = new FlyIO(this)
		this._configure()
	}

	private async _configure() {
		if (projectDirectory) {
			const readPorts = await readPortsFromDevContainer()
			currentDevPort = `${readPorts.devPort ?? defaultWebDevPort}`
			currentProdPort = `${readPorts.prodPort ?? defaultWebProdPort}`
			createDebugConfigIfNeeded()
			this.setHotReload()
			this.setHotRebuild()
			this.setLoggingLevel()
			this.setWebSourcesPath()
			workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('web.hotReload'))
					this.setHotReload()
				if (event.affectsConfiguration('web.hotRebuild'))
					this.setHotRebuild()
				if (event.affectsConfiguration('web.loggingLevel'))
					this.setLoggingLevel()
				if (event.affectsConfiguration('web.webSourcesPath'))
					this.setWebSourcesPath()
				if (event.affectsConfiguration('web.appTargetName'))
					this.setAppTargetName()
				if (event.affectsConfiguration('web.serviceWorkerTargetName'))
					this.setServiceWorkerTargetName()
			})
			this.crawlServer.registerTaskProvider({
				pathToWasm: `${projectDirectory}/${buildDevFolder}/${appTargetName.toLowerCase()}.wasm`,
				debug: true
			})
		}
	}

	setHotReload(value?: boolean) {
		isHotReloadEnabled = value ?? workspace.getConfiguration().get('web.hotReload') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('web.hotReload', value)
		sidebarTreeView?.refresh()
	}

	setHotRebuild(value?: boolean) {
		isHotRebuildEnabled = value ?? workspace.getConfiguration().get('web.hotRebuild') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('web.hotRebuild', value)
		sidebarTreeView?.refresh()
	}

	setLoggingLevel(value?: LogLevel) {
		currentLoggingLevel = value ?? workspace.getConfiguration().get('web.loggingLevel') as LogLevel
		if (value) workspace.getConfiguration().update('web.loggingLevel', value)
		sidebarTreeView?.refresh()
	}

	setWebSourcesPath(value?: string) {
		const newValue = value ?? workspace.getConfiguration().get('web.webSourcesPath') as string
		if (webSourcesFolder != newValue) {
			const oldPath = `${projectDirectory}/${webSourcesFolder}`
			const newPath = `${projectDirectory}/${newValue}`
			if (fs.existsSync(oldPath) && !fs.existsSync(newPath))
				fs.renameSync(oldPath, newPath)
		}
		webSourcesFolder = newValue
		if (value) workspace.getConfiguration().update('web.webSourcesPath', value)
		sidebarTreeView?.refresh()
	}

	setAppTargetName(value?: string) {
		appTargetName = value ?? workspace.getConfiguration().get('web.appTargetName') as string
		if (value) workspace.getConfiguration().update('web.appTargetName', value)
		sidebarTreeView?.refresh()
	}

	setServiceWorkerTargetName(value?: string) {
		serviceWorkerTargetName = value ?? workspace.getConfiguration().get('web.serviceWorkerTargetName') as string
		if (value) workspace.getConfiguration().update('web.serviceWorkerTargetName', value)
		sidebarTreeView?.refresh()
	}

	registercommands() {
		extensionContext.subscriptions.push(commands.registerCommand('clickOnErrorStatusBarItem', () => {
			clearStatus()
			showOutput()
		}))
		extensionContext.subscriptions.push(commands.registerCommand('clickOnSuccessStatusBarItem', () => {
			clearStatus()
			showOutput()
		}))
		extensionContext.subscriptions.push(commands.registerCommand('clickOnStatusBarItem', showOutput))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ReopenInContainer, reopenInContainerCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.WhyReopenInContainer, whyReopenInContainerCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewProject, startNewProjectWizard))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Build, buildCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DebugInChrome, debugInChromeCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunCrawlServer, async () => { await this.crawlServer.startStop() }))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HotReload, hotReloadCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HotRebuild, hotRebuildCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFilePage, newFilePageCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileClass, newFileClassCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileJS, newFileJSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileSCSS, newFileCSSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.BuildRelease, buildReleaseCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ClearBuildCache, clearBuildCacheCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileApp, () => {
			hotRebuildSwift({ target: appTargetName })
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileService, () => {
			hotRebuildSwift({ target: serviceWorkerTargetName })
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileJS, hotRebuildJS))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileCSS, hotRebuildCSS))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileHTML, hotRebuildHTML))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Toolchain, toolchainCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DevPort, portDevCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ProdPort, portProdCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.LoggingLevel, loggingLevelCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.UpdateWeb, updateWebCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.UpdateJSKit, updateJSKitCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.WebDocumentation, webDocumentationCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AndroidDocumentation, androidDocumentationCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.VaporDocumentation, vaporDocumentationCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HummingbirdDocumentation, hummingbirdDocumentationCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ServerDocumentation, serverDocumentationCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Repository, repositoryCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Discussions, discussionsCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.SubmitAnIssue, submitAnIssueCommand))

		// Cloud Providers
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddFirebase, this.firebase.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Firebase, () => {}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FirebaseSetup, this.firebase.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FirebaseDeployMode, this.firebase.changeDeployMode))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FirebaseDeploy, this.firebase.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FirebaseDeintegrate, this.firebase.deintegrate))
		
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddFlyIO, this.flyio.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FlyIOSetup, this.flyio.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FlyIODeploy, this.flyio.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FlyIODeintegrate, this.flyio.deintegrate))
	}

	onDidRenameFiles(event: FileRenameEvent) {
		const webSourcesRename = event.files.filter(x => x.oldUri.path === `${projectDirectory}/${webSourcesFolder}`).pop()
		if (webSourcesRename) {
			const newFolderName = webSourcesRename.newUri.path.replace(`${projectDirectory}/`, '')
			this.setWebSourcesPath(newFolderName)
		}
	}

	onDidDeleteFiles(event: FileDeleteEvent) {
		if (event.files.find((f) => f.path == `${projectDirectory}/Firebase`)) {
			sidebarTreeView?.refresh()
		}
	}
}

// MARK: Print

export function clearPrint() {
	output.clear()
}

export function showOutput() {
	output.show()
}
interface ExtendedPrintMessage {
	normal?: string,
	detailed?: string,
	verbose?: string,
	unbearable?: string
}
const isExtendedPrintMessage = (value: any): value is ExtendedPrintMessage => (!!value?.normal || !!value?.detailed || !!value?.verbose || !!value?.unbearable)
export function print(message: string | ExtendedPrintMessage, level: LogLevel = LogLevel.Normal, show: boolean | null = null) {
	if (isExtendedPrintMessage(message)) {
		if (currentLoggingLevel == LogLevel.Normal) {
			if (message.normal) output.appendLine(`${message.normal}`)
		} else if (currentLoggingLevel == LogLevel.Detailed) {
			if (message.detailed) output.appendLine(`${message.detailed}`)
			else if (message.normal) output.appendLine(`${message.normal}`)
		} else if (currentLoggingLevel == LogLevel.Verbose) {
			if (message.verbose) output.appendLine(`${message.verbose}`)
			else if (message.detailed) output.appendLine(`${message.detailed}`)
			else if (message.normal) output.appendLine(`${message.normal}`)
		} else if (currentLoggingLevel == LogLevel.Unbearable) {
			if (message.unbearable) output.appendLine(`${message.unbearable}`)
			else if (message.verbose) output.appendLine(`${message.verbose}`)
			else if (message.detailed) output.appendLine(`${message.detailed}`)
			else if (message.normal) output.appendLine(`${message.normal}`)
		}
	} else {
		if (level == LogLevel.Detailed && currentLoggingLevel == LogLevel.Normal)
			return
		if (level == LogLevel.Verbose && [LogLevel.Normal, LogLevel.Detailed].includes(currentLoggingLevel))
			return
		if (level == LogLevel.Unbearable && [LogLevel.Normal, LogLevel.Detailed, LogLevel.Verbose].includes(currentLoggingLevel))
			return
		var symbol = ''
		if (level == LogLevel.Detailed)
			symbol = ''
		else if (level == LogLevel.Verbose)
			symbol = ''
		else if (level == LogLevel.Unbearable)
			symbol = ''
		output.appendLine(`${symbol}${message}`)
	}
	if (show) output.show()
}

// MARK: Status

export enum StatusType {
	Default, Warning, Error, Success
}

export function clearStatus() {
	problemStatusBarIcon.command = undefined
	problemStatusBarItem.command = undefined
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
	case StatusType.Success:
	case StatusType.Default:			
		problemStatusBarIcon.backgroundColor = undefined
		problemStatusBarIcon.color = undefined
		problemStatusBarItem.backgroundColor = undefined
		problemStatusBarItem.color = undefined
		problemStatusBarItem.command = type == StatusType.Success ? 'clickOnSuccessStatusBarItem' : 'clickOnStatusBarItem'
		break
	case StatusType.Warning:
		problemStatusBarIcon.backgroundColor = new ThemeColor('statusBarItem.warningBackground')
		problemStatusBarIcon.color = undefined
		problemStatusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground')
		problemStatusBarItem.color = undefined
		problemStatusBarItem.command = 'clickOnErrorStatusBarItem'
		break
	case StatusType.Error:
		problemStatusBarIcon.backgroundColor = new ThemeColor('statusBarItem.errorBackground')
		problemStatusBarIcon.color = new ThemeColor('errorForeground')	
		problemStatusBarItem.backgroundColor = new ThemeColor('statusBarItem.errorBackground')
		problemStatusBarItem.color = new ThemeColor('errorForeground')
		problemStatusBarItem.command = 'clickOnErrorStatusBarItem'
		break
	}
	problemStatusBarIcon.command = command ?? problemStatusBarIcon.command
	problemStatusBarItem.command = command ?? problemStatusBarItem.command
	problemStatusBarItem.show()
}
export function buildStatus(text: string) {
	status('sync~spin', text, StatusType.Default)
}