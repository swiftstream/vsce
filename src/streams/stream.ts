import { window, debug, StatusBarAlignment, commands, ThemeColor, workspace, ConfigurationChangeEvent, FileDeleteEvent, FileRenameEvent, TextDocument, DebugSession, TreeItemCollapsibleState } from 'vscode'
import { AbortHandler, Bash } from '../bash'
import { Pgrep } from '../pgrep'
import { Swift } from '../swift'
import { Toolchain } from '../toolchain'
import { currentStream, extensionContext, ExtensionStream, extensionStream, isInContainer, projectDirectory, sidebarTreeView } from '../extension'
import { Dependency, SideTreeItem } from '../sidebarTreeView'
import { clearBuildCacheCommand } from '../commands/clearBuildCache'
import { toolchainCommand } from '../commands/toolchain'
import { loggingLevelCommand } from '../commands/loggingLevel'
import { openWebDiscussions, openWebRepository, submitWebIssue, openWebDocumentation, openVaporDocumentation, openHummingbirdDocumentation, openSwiftStreamDocumentation, openWebDiscord, openVaporDiscord, openHummingbirdDiscord, openSwiftStreamServerDiscord, openWebTelegram, openAndroidTelegram, openServerTelegram, openAndroidDiscord, openAndroidDocumentation, openAndroidRepository, openVaporRepository, openHummingbirdRepository, openAndroidDiscussions, openVaporDiscussions, openHummingbirdDiscussions, submitVaporIssue, submitHummingbirdIssue, submitAndroidIssue, openServerForums, openAndroidForums, openWebForums, openSwiftForums } from '../commands/support'
import { hotRebuildCommand } from '../commands/hotRebuild'
import { isPackagePresentInResolved, KnownPackage } from '../commands/build/helpers'
import { generateChecksum } from '../helpers/filesHelper'
import { AnyFeature } from './anyFeature'

export var isBuildingDebug = false
export var isBuildingRelease = false
export var isHotBuildingSwift = false
export var isHotRebuildEnabled = false
export var isClearingBuildCache = false
export var isClearedBuildCache = false

export class Stream {
    public bash: Bash
    public toolchain: Toolchain
    public swift: Swift
    public pgrep: Pgrep
	
    constructor() {
        this.bash = new Bash()
        this.toolchain = new Toolchain(this)
        this.swift = new Swift(this)
        this.pgrep = new Pgrep(this)
        this._configure()
    }

    private _configure = async () => {
        if (!projectDirectory) return
		this.setLoggingLevel()
		this.setHotRebuild()
        workspace.onDidChangeConfiguration((event) => {
            this.onDidChangeConfiguration(event)
        })
		extensionContext.subscriptions.push(debug.onDidStartDebugSession(async (e: DebugSession) => {
			await this.onDidStartDebugSession(e)
		}))
		extensionContext.subscriptions.push(debug.onDidTerminateDebugSession(async (e: DebugSession) => {
			await this.onDidTerminateDebugSession(e)
        }))
    }

	isDebugerAttachedLater: boolean = false
	async onDidStartDebugSession(session: DebugSession) {}
	async onDidTerminateDebugSession(session: DebugSession) {}

    async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        if (event.affectsConfiguration('stream.loggingLevel'))
			this.setLoggingLevel()
		if (event.affectsConfiguration('swift.hotRebuild'))
			this.setHotRebuild()
    }

	isAnyHotBuilding(): boolean {
		return isHotBuildingSwift
	}

    setLoggingLevel(value?: LogLevel) {
        currentLoggingLevel = value ?? workspace.getConfiguration().get('stream.loggingLevel') as LogLevel
        if (value) workspace.getConfiguration().update('stream.loggingLevel', value)
        sidebarTreeView?.refresh()
    }
		
	setHotBuildingSwift(active: boolean) {
		isHotBuildingSwift = active
	}

    onDidRenameFiles(event: FileRenameEvent) {}
    onDidDeleteFiles(event: FileDeleteEvent) {}

    registerCommands() {
        extensionContext.subscriptions.push(commands.registerCommand('clickOnErrorStatusBarItem', () => {
            clearStatus()
            showOutput()
        }))
        extensionContext.subscriptions.push(commands.registerCommand('clickOnSuccessStatusBarItem', () => {
            clearStatus()
            showOutput()
        }))
        extensionContext.subscriptions.push(commands.registerCommand('clickOnStatusBarItem', showOutput))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.BuildDebug, async () => await currentStream?.buildDebug() ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HotRebuild, hotRebuildCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.BuildRelease, async () => await currentStream?.buildRelease() ))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ClearBuildCache, clearBuildCacheCommand))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Toolchain, toolchainCommand))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.LoggingLevel, loggingLevelCommand))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Documentation, () => {
			if (isPackagePresentInResolved(KnownPackage.Web)) {
				openWebDocumentation()
			} else if (isPackagePresentInResolved(KnownPackage.Droid)) {
				openAndroidDocumentation()
			} else if (isPackagePresentInResolved(KnownPackage.Vapor)) {
				openVaporDocumentation()
			} else if (isPackagePresentInResolved(KnownPackage.Hummingbird)) {
				openHummingbirdDocumentation()
			} else {
				openSwiftStreamDocumentation()
			}
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Repository, () => {
			if (isPackagePresentInResolved(KnownPackage.Web)) {
				openWebRepository()
			} else if (isPackagePresentInResolved(KnownPackage.Droid)) {
				openAndroidRepository()
			} else if (isPackagePresentInResolved(KnownPackage.Vapor)) {
				openVaporRepository()
			} else if (isPackagePresentInResolved(KnownPackage.Hummingbird)) {
				openHummingbirdRepository()
			}
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Discussions, async () => {
			if (isPackagePresentInResolved(KnownPackage.Web)) {
				openWebDiscussions()
			} else if (isPackagePresentInResolved(KnownPackage.Droid)) {
				openAndroidDiscussions()
			} else if (isPackagePresentInResolved(KnownPackage.Vapor)) {
				openVaporDiscussions()
			} else if (isPackagePresentInResolved(KnownPackage.Hummingbird)) {
				openHummingbirdDiscussions()
			}
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.SubmitAnIssue, async () => {
			if (isPackagePresentInResolved(KnownPackage.Web)) {
				submitWebIssue()
			} else if (isPackagePresentInResolved(KnownPackage.Droid)) {
				submitAndroidIssue()
			} else if (isPackagePresentInResolved(KnownPackage.Vapor)) {
				submitVaporIssue()
			} else if (isPackagePresentInResolved(KnownPackage.Hummingbird)) {
				submitHummingbirdIssue()
			}
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.OpenDiscord, async () => {
			const openSwiftStream = 'Official Swift.Stream Community in Discord'
			const openVapor = 'Official Vapor Community in Discord'
			const openHummingbird = 'Official Hummingbird Community in Discord'
			if (isPackagePresentInResolved(KnownPackage.Web)) {
				openWebDiscord()
			} else if (isPackagePresentInResolved(KnownPackage.Droid)) {
				openAndroidDiscord()
			} else if (isPackagePresentInResolved(KnownPackage.Vapor)) {
				switch (await window.showQuickPick([
					openSwiftStream,
					openVapor
				], {
					placeHolder: `Choose the community`
				})) {
					case openSwiftStream:
						openSwiftStreamServerDiscord()
						break
					case openVapor:
						openVaporDiscord()
						break
					default: break
				}
			} else if (isPackagePresentInResolved(KnownPackage.Hummingbird)) {
				switch (await window.showQuickPick([
					openSwiftStream,
					openHummingbird
				], {
					placeHolder: `Choose the community`
				})) {
					case openSwiftStream:
						openSwiftStreamServerDiscord()
						break
					case openHummingbird:
						openHummingbirdDiscord()
						break
					default: break
				}
			}
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.OpenTelegram, () => {
			if (extensionStream == ExtensionStream.Web || isPackagePresentInResolved(KnownPackage.Web)) {
				openWebTelegram()
			} else if (extensionStream == ExtensionStream.Android || isPackagePresentInResolved(KnownPackage.Droid)) {
				openAndroidTelegram()
			} else {
				openServerTelegram()
			}
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.OpenSwiftForums, () => {
			if (extensionStream == ExtensionStream.Web || isPackagePresentInResolved(KnownPackage.Web)) {
				openWebForums()
			} else if (extensionStream == ExtensionStream.Android || isPackagePresentInResolved(KnownPackage.Droid)) {
				openAndroidForums()
			} else if (extensionStream == ExtensionStream.Server || isPackagePresentInResolved(KnownPackage.Vapor) || isPackagePresentInResolved(KnownPackage.Hummingbird)) {
				openServerForums()
			} else {
				openSwiftForums()
			}
		}))
		this.features().forEach((x) => x.registerCommands())
    }

	private hotReloadHashes: any = {}

	async goThroughHashCheck(document: TextDocument, handler: () => Promise<void>) {
		const oldChecksum = this.hotReloadHashes[document.uri.path]
		const newChecksum = generateChecksum(document.getText())
		print(`Checking ${document.uri.path.split('/').pop()}\noldChecksum: ${oldChecksum}\nnewChecksum: ${newChecksum}`, LogLevel.Unbearable)
		if (oldChecksum && oldChecksum === newChecksum) {
			print(`Skipping hot realod, file wasn't changed: ${document.uri.path.split('/').pop()}`, LogLevel.Verbose)
		} else {
			try {
				await handler()
				this.hotReloadHashes[document.uri.path] = newChecksum
			} catch (error) {
				const json = JSON.stringify(error)
				print(`${document.uri.path.split('/').pop()} failed to hot realod: ${json === '{}' ? error : json}`, LogLevel.Verbose)
			}
		}
	}

	async onDidSaveTextDocument(document: TextDocument): Promise<boolean> {
		if (!isInContainer) return false
		if (document.uri.scheme === 'file') {
			// Swift
			if (['swift'].includes(document.languageId) && isHotRebuildEnabled) {
				// Package.swift
				if (document.uri.path === `${projectDirectory}/Package.swift`) {
					await this.goThroughHashCheck(document, async () => {
						await this.hotRebuildSwift()
					})
					return true
				}
				// Swift sources
				else if (document.uri.path.startsWith(`${projectDirectory}/Sources/`)) {
					const target = `${document.uri.path}`.replace(`${projectDirectory}/Sources/`, '').split('/')[0]
					if (target) {
						await this.goThroughHashCheck(document, async () => {
							await this.hotRebuildSwift({ target: target })
						})
						return true
					}
				}
			}
		}
		return false
	}

	// MARK: Features

	features(): AnyFeature[] { return [] }

	// MARK: Building Debug

	async askToBuildDebug(beforeWhat?: string): Promise<boolean> {
		switch (await window.showWarningMessage(`Make a debug build ${(beforeWhat ? `before ${beforeWhat}` : 'first')}`, 'Build Debug')) {
			case 'Build Debug':
				await this.buildRelease()
				return true
			default: return false
		}
	}

	async buildDebug() {
		print('stream.build not implemented', LogLevel.Detailed)
	}

	async hotRebuildSwift(params?: { target?: string }) {
		print('stream.hotRebuildSwift not implemented or called super', LogLevel.Detailed)
	}

	private abortBuildingDebugHandler: AbortHandler | undefined

	setAbortBuildingDebugHandler(onCancel: () => void): AbortHandler {
		this.abortBuildingDebugHandler = new AbortHandler(() => onCancel())
		return this.abortBuildingDebugHandler
	}

	async abortBuildingDebug() {
		this.abortBuildingDebugHandler?.abort()
	}

	// MARK: Building Release

	async askToBuildRelease(beforeWhat?: string): Promise<boolean> {
		switch (await window.showWarningMessage(`Make a release build ${(beforeWhat ? `before ${beforeWhat}` : 'first')}`, 'Build Release')) {
			case 'Build Release':
				await this.buildRelease()
				return true
			default: return false
		}
	}

	async buildRelease(successCallback?: any) {
		print('stream.buildRelease not implemented', LogLevel.Detailed)
	}

	private abortBuildingReleaseHandler: AbortHandler | undefined

	setAbortBuildingReleaseHandler(onCancel: () => void): AbortHandler {
		this.abortBuildingReleaseHandler = new AbortHandler(() => onCancel())
		return this.abortBuildingReleaseHandler
	}
	
	async abortBuildingRelease() {
		this.abortBuildingReleaseHandler?.abort()
	}

	// MARK: Side Bar Tree View Items

	async defaultDebugActionItems(): Promise<Dependency[]> {
		return []
	}

	async debugActionItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		await Promise.all(this.features().map(async (feature) => {
            items.push(...(await feature.debugActionItems()))
        }))
		return items
	}
	async debugOptionItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		await Promise.all(this.features().map(async (feature) => {
            items.push(...(await feature.debugOptionItems()))
        }))
		return items
	}
	async releaseItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		await Promise.all(this.features().map(async (feature) => {
            items.push(...(await feature.releaseItems()))
        }))
		return items
	}
	async projectItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		await Promise.all(this.features().map(async (feature) => {
            items.push(...(await feature.projectItems()))
        }))
		return items
	}
	async maintenanceItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		await Promise.all(this.features().map(async (feature) => {
            items.push(...(await feature.maintenanceItems()))
        }))
		return items
	}
	async settingsItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		await Promise.all(this.features().map(async (feature) => {
            items.push(...(await feature.settingsItems()))
        }))
		return items
	}
	async isThereAnyFeature(): Promise<boolean> {
		return (await this.isThereInstalledFeatures()) || (await this.isThereFeaturesToAdd())
	}
	async isThereInstalledFeatures(): Promise<boolean> {
		return (await this.installedFeatureItems()).length > 0
	}
	async installedFeatureItems(): Promise<Dependency[]> {
		return this.features().filter((x) => x.isInstalled).map((x) => {
			return new Dependency(x.name, x.name, '', TreeItemCollapsibleState.Collapsed, sidebarTreeView!.fileIcon(x.iconFile, x.iconFileDark))
		})
	}
	async isThereFeaturesToAdd(): Promise<boolean> {
		return (await this.addFeatureItems()).length > 0
	}
	async addFeatureItems(): Promise<Dependency[]> {
		return this.features().filter((x) => !x.isInstalled).map((x) => x.integrateMenuElement())
	}
	async isThereAnyRecommendation(): Promise<boolean> { return (await this.recommendationsItems()).length > 0 }
	async recommendationsItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		await Promise.all(this.features().map(async (feature) => {
            items.push(...(await feature.recommendationsItems()))
        }))
		return items
	}
	async customItems(element: Dependency): Promise<Dependency[]> {
		let items: Dependency[] = []
		const feature = this.features().find((x) => x.name === element.id)
		if (feature) {
			items.push(...(await feature.customItems(element)))
		}
		return items
	}

	}

	setBuildingDebug(active: boolean) {
		if (!active) this.abortBuildingDebugHandler = undefined
		isBuildingDebug = active
		commands.executeCommand('setContext', 'isBuildingDebug', active)
	}
	
	setBuildingRelease(active: boolean) {
		if (!active) this.abortBuildingReleaseHandler = undefined
		isBuildingRelease = active
		commands.executeCommand('setContext', 'isBuildingRelease', active)
	}
	
	setHotRebuild(value?: boolean) {
		isHotRebuildEnabled = value ?? workspace.getConfiguration().get('swift.hotRebuild') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('swift.hotRebuild', value)
		sidebarTreeView?.refresh()
	}

	setClearingBuildCache(active: boolean) {
		isClearingBuildCache = active
	}

	setClearedBuildCache(active: boolean) {
		isClearedBuildCache = active
	}
}

// MARK: Print

export enum LogLevel {
	Normal = 'Normal',
	Detailed = 'Detailed',
	Verbose = 'Verbose',
	Unbearable = 'Unbearable'
}

export var currentLoggingLevel: LogLevel = LogLevel.Normal
export let output = window.createOutputChannel('SwiftStream')
export let problemStatusBarIcon = window.createStatusBarItem(StatusBarAlignment.Left, 0)
export let problemStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 0)

export function clearPrint() {
	output.clear()
}

export function showOutput() {
	output.show()
}
interface ExtendedPrintMessage {
	normal?: string
	detailed?: string
	verbose?: string
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
