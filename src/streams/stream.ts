import { window, debug, StatusBarAlignment, commands, ThemeColor, workspace, ConfigurationChangeEvent, FileDeleteEvent, FileRenameEvent, TextDocument, DebugSession } from 'vscode'
import { Bash } from '../bash'
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

export var isDebugging = false
export var isBuildingDebug = false
export var isBuildingRelease = false
export var abortBuildingDebug: (() => void) | undefined
export var abortBuildingRelease: (() => void) | undefined
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
		extensionContext.subscriptions.push(debug.onDidTerminateDebugSession(async (e: DebugSession) => {
			await this.onDidTerminateDebugSession(e)
        }))
    }

	async onDidTerminateDebugSession(session: DebugSession) {
		if (session.configuration.type.includes('lldb')) {
			this.setDebugging(false)
			sidebarTreeView?.refresh()
		}
	}

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

	// MARK: Building

	async buildDebug() {
		print('stream.build not implemented', LogLevel.Detailed)
	}

	async hotRebuildSwift(params?: { target?: string }) {
		print('stream.hotRebuildSwift not implemented or called super', LogLevel.Detailed)
	}

	async buildRelease(successCallback?: any) {
		print('stream.buildRelease not implemented', LogLevel.Detailed)
	}

	// MARK: Side Bar Tree View Items

	async debugActionItems(): Promise<Dependency[]> { return [] }
	async debugOptionItems(): Promise<Dependency[]> { return [] }
	async releaseItems(): Promise<Dependency[]> { return [] }
	async projectItems(): Promise<Dependency[]> { return [] }
	async maintenanceItems(): Promise<Dependency[]> { return [] }
	async settingsItems(): Promise<Dependency[]> { return [] }
	async isThereAnyRecommendation(): Promise<boolean> { return false }
	async recommendationsItems(): Promise<Dependency[]> { return [] }
	async customItems(element: Dependency): Promise<Dependency[]> { return [] }

	setAbortBuildingDebug(handler: () => void | undefined) {
		abortBuildingDebug = handler
	}

	setBuildingDebug(active: boolean) {
		if (!active) abortBuildingDebug = undefined
		isBuildingDebug = active
		commands.executeCommand('setContext', 'isBuilding', active)
	}
		
	setAbortBuildingRelease(handler: () => void | undefined) {
		abortBuildingRelease = handler
	}
	
	setBuildingRelease(active: boolean) {
		if (!active) abortBuildingRelease = undefined
		isBuildingRelease = active
		commands.executeCommand('setContext', 'isBuildingRelease', active)
	}
		
	setDebugging(active: boolean) {
		isDebugging = active
		commands.executeCommand('setContext', 'isDebugging', active)
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
