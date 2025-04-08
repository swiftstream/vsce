import { window, debug, StatusBarAlignment, commands, ThemeColor, workspace, ConfigurationChangeEvent, FileDeleteEvent, FileRenameEvent, TextDocument, DebugSession, TreeItemCollapsibleState } from 'vscode'
import { AbortHandler, Bash } from '../bash'
import { Pgrep } from '../pgrep'
import { Swift } from '../swift'
import { Toolchain } from '../toolchain'
import { ContextKey, extensionContext, ExtensionStream, extensionStream, isArm64, isInContainer, projectDirectory, sidebarTreeView } from '../extension'
import { Dependency, SideTreeItem } from '../sidebarTreeView'
import { clearCachesCommand } from '../commands/clearCaches'
import { toolchainCommand } from '../commands/toolchain'
import { loggingLevelCommand } from '../commands/loggingLevel'
import { openWebDiscussions, openWebRepository, submitWebIssue, openWebDocumentation, openVaporDocumentation, openHummingbirdDocumentation, openWebDiscord, openVaporDiscord, openHummingbirdDiscord, openSwiftStreamServerDiscord, openWebTelegram, openAndroidTelegram, openServerTelegram, openAndroidDiscord, openAndroidDocumentation, openAndroidRepository, openVaporRepository, openHummingbirdRepository, openAndroidDiscussions, openVaporDiscussions, openHummingbirdDiscussions, submitVaporIssue, submitHummingbirdIssue, submitAndroidIssue, openServerForums, openAndroidForums, openWebForums, openSwiftForums, submitSwiftStreamVSCEIssue, submitCrawlServerIssue, openSwiftGettingStarted } from '../commands/support'
import { hotRebuildCommand } from '../commands/hotRebuild'
import { isPackagePresentInResolved, KnownPackage } from '../commands/build/helpers'
import { generateChecksum } from '../helpers/filesHelper'
import { AnyFeature } from './anyFeature'
import { restartLSPCommand } from '../commands/restartLSP'
import { clearLogOnRebuildCommand } from '../commands/clearLogOnRebuild'
import { resolvePackagesCommand } from '../commands/resolvePackages'
import { mountNewItemCommand } from '../commands/mountNewItem'
import { sshHostInstructions } from '../commands/sshHostInstructions'
import { rebuildContainer } from '../commands/rebuildContainer'

export var isTestable = false
export var isBuildingDebug = false
export var isBuildingRelease = false
export var isHotBuildingSwift = false
export var isHotRebuildEnabled = false
export var isClearLogBeforeBuildEnabled = false
export var isTesting = false
export var isClearingCache = false
export var isClearedCache = false
export var isRestartingLSP = false
export var isResolvingPackages = false
export var isRestartedLSP = false

export class Stream {
    public bash: Bash
    public toolchain: Toolchain
    public swift: Swift
    public pgrep: Pgrep
	
    constructor(overrideConfigure: boolean = false) {
        this.bash = new Bash()
        this.toolchain = new Toolchain(this)
        this.swift = new Swift(this)
        this.pgrep = new Pgrep(this)
		if (!overrideConfigure) this.configure()
    }

	configure() {
		if (!projectDirectory) return
		this.setLoggingLevel()
		this.setHotRebuild()
		this.setClearLogBeforeBuild()
        workspace.onDidChangeConfiguration((event) => {
            this.onDidChangeConfiguration(event)
        })
		extensionContext.subscriptions.push(debug.onDidStartDebugSession(async (e: DebugSession) => {
			await this.onDidStartDebugSession(e)
		}))
		extensionContext.subscriptions.push(debug.onDidTerminateDebugSession(async (e: DebugSession) => {
			await this.onDidTerminateDebugSession(e)
        }))
		if (this.swift.doesPackageContainsTestTarget()) {
			isTestable = true
			sidebarTreeView?.refresh()
		}
		const activeFeatures = this.features().filter((x) => x.isInUse())
		async function proceedFeatures() {
			await Promise.all(activeFeatures.map((x) => x.onStartup()))
		}
		proceedFeatures()
	}

	isDebugerAttachedLater: boolean = false
	async onDidStartDebugSession(session: DebugSession) {}
	async onDidTerminateDebugSession(session: DebugSession) {}

    async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        if (event.affectsConfiguration('stream.loggingLevel'))
			this.setLoggingLevel()
		if (event.affectsConfiguration('swift.hotRebuild'))
			this.setHotRebuild()
		if (event.affectsConfiguration('swift.clearLogBeforeBuild'))
			this.setClearLogBeforeBuild()
		if (event.affectsConfiguration('swift.showTopRunButton'))
			this.setShowTopRunButton()
		if (event.affectsConfiguration('swift.showTopBuildButton'))
			this.setShowTopBuildButton()
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
		extensionContext.subscriptions.push(commands.registerCommand('chooseDebugTarget', async () => await this.swift.chooseDebugTarget() ))
        extensionContext.subscriptions.push(commands.registerCommand('chooseReleaseTarget', async () => this.swift.chooseReleaseTarget() ))
		extensionContext.subscriptions.push(commands.registerCommand('chooseTestTarget', async () => this.swift.chooseReleaseTarget() ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.BuildDebug, async () => await this.buildDebug() ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HotRebuild, hotRebuildCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.BuildRelease, async () => await this.buildRelease() ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Test, async () => await this.runAllTests() ))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.MountNewItem, async () => await mountNewItemCommand() ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.CheckSSH, async () => Bash.runCommandInTerminal('clear && echo -e "\\x1b[1;32m\\nAlready loaded keys:\\n\\x1b[0m" && ssh-add -l && echo -e "\n"', 'SSH Agent') ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.CheckGithubAccess, async () => Bash.runCommandInTerminal('clear && echo -e "\\x1b[1;33m\\nChecking connection to GitHub:\\n\\x1b[0m" && ssh -A -T git@github.com; echo -e "\n"', 'SSH Agent') ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.SSHHostInstructions, async () => await sshHostInstructions() ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.LocalTerminal, async () => commands.executeCommand('workbench.action.terminal.newLocal') ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RebuildContainer, async () => await rebuildContainer() ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RebuildContainerWithoutCache, async () => await rebuildContainer({ noCache: true }) ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ClearCaches, async () => await clearCachesCommand() ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RestartLSP, async () => await restartLSPCommand() ))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ResolvePackages, async () => await resolvePackagesCommand() ))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Toolchain, toolchainCommand))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.LoggingLevel, loggingLevelCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ClearLogOnRebuild, clearLogOnRebuildCommand))
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
				openSwiftGettingStarted()
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
			const swiftStream = "Swift Stream extension"
			if (isPackagePresentInResolved(KnownPackage.Web)) {
				const web = "Web framework"
				const crawlServer = "Crawl Server"
				switch (await window.showQuickPick([web, crawlServer, swiftStream], {
					placeHolder: `Select in which repository`
				})) {
					case web:
						submitWebIssue()
						break
					case crawlServer:
						submitCrawlServerIssue()
						break
					case swiftStream:
						submitSwiftStreamVSCEIssue()
						break
					default: return
				}
			} else if (isPackagePresentInResolved(KnownPackage.Droid)) {
				const android = "Android framework"
				switch (await window.showQuickPick([android, swiftStream], {
					placeHolder: `Select in which repository`
				})) {
					case android:
						submitAndroidIssue()
						break
					case swiftStream:
						submitSwiftStreamVSCEIssue()
						break
					default: return
				}
			} else if (isPackagePresentInResolved(KnownPackage.Vapor)) {
				const vapor = "Vapor framework"
				switch (await window.showQuickPick([vapor, swiftStream], {
					placeHolder: `Select in which repository`
				})) {
					case vapor:
						submitVaporIssue()
						break
					case swiftStream:
						submitSwiftStreamVSCEIssue()
						break
					default: return
				}
			} else if (isPackagePresentInResolved(KnownPackage.Hummingbird)) {
				const hummingbird = "Hummingbird framework"
				switch (await window.showQuickPick([hummingbird, swiftStream], {
					placeHolder: `Select in which repository`
				})) {
					case hummingbird:
						submitHummingbirdIssue()
						break
					case swiftStream:
						submitSwiftStreamVSCEIssue()
						break
					default: return
				}
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
		const features = this.features()
		for (let i = 0; i < features.length; i++) {
			const feature = features[i]
			feature.registerCommands()
		}
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
					print(`Stream detected changes in Package.swift file`, LogLevel.Unbearable)
					await this.goThroughHashCheck(document, async () => {
						await this.hotRebuildSwift()
					})
					return true
				}
				// Swift sources
				else if (document.uri.path.startsWith(`${projectDirectory}/Sources/`)) {
					print(`Stream detected changes in Swift file`, LogLevel.Unbearable)
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

	// MARK: Context

	setContext(key: ContextKey, value: any) {
		commands.executeCommand('setContext', key, value)
	}

	// MARK: Features

	features(): AnyFeature[] { return [] }

	// MARK: Global Keybinding

	async globalKeyBuild() {
		await this.buildDebug()
	}

	async globalKeyRun() {
		print(`Run hot key is not implemented for the current stream`, LogLevel.Unbearable)
	}

	async globalKeyStop() {
		await commands.executeCommand('workbench.action.debug.stop')
		await this.abortBuildingDebug()
	}

	async globalKeyTest() {
		await this.runAllTests()
	}

	// MARK: Tests

	async runAllTests() {
		if (!isTestable) {
			window.showWarningMessage(`Unable to find test targets in your Package.swift`)
			return
		}
		if (isTesting) return
		commands.executeCommand('testing.runAll')
		async function checkIfSwiftTestRunning(ctx: Stream, attempt: number = 0): Promise<boolean> {
			if (await ctx.pgrep.isSwiftTestRunning()) {
				if (!isTesting) {
					isTesting = true
					sidebarTreeView?.refresh()
				}
				return true
			}
			if (attempt < 4) {
				await new Promise((x) => setTimeout(x, 500))
				return await checkIfSwiftTestRunning(ctx, attempt + 1)
			}
			isTesting = false
			sidebarTreeView?.refresh()
			return false
		}
		while (await checkIfSwiftTestRunning(this)) {}
	}

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
		if (isClearLogBeforeBuildEnabled) {
			print('🧹 Log has been cleared before building because it is enabled in advanced settings', LogLevel.Unbearable)
			clearPrint()
		}
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

	async askToBuildRelease(options: {
		beforeWhat?: string,
		askToContinueTo?: {
			toText: string,
			continueTitle: string
		}
	}): Promise<boolean> {
		switch (await window.showWarningMessage(`Make a release build ${(options.beforeWhat ? `before ${options.beforeWhat}` : 'first')}`, 'Build Release')) {
			case 'Build Release':
				await this.buildRelease()
				if (options.askToContinueTo) {
					switch (await window.showWarningMessage(`Release build succeeded! Would you like to proceed to ${options.askToContinueTo.toText}?`, options.askToContinueTo.continueTitle)) {
						case options.askToContinueTo.continueTitle: return true
						default: return false
					}
				} else {
					return true
				}
			default: return false
		}
	}
	
	compilationFolder(musl: boolean): string {
		return `${isArm64 ? 'aarch64' : 'x86_64'}-${musl ? 'swift-linux-musl' : 'unknown-linux-gnu'}`
	}

	async buildRelease(successCallback?: any) {
		if (isClearLogBeforeBuildEnabled) {
			print('🧹 Log has been cleared before building because it is enabled in advanced settings', LogLevel.Unbearable)
			clearPrint()
		}
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
			return new Dependency({
				id: x.name,
				label: x.name,
				state: TreeItemCollapsibleState.Collapsed,
				icon: sidebarTreeView!.fileIcon(x.iconFile, x.iconFileDark)
			})
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

	async awaitForCompletionOfOtherSwiftProcessesIfNeeded(title: string = '', attempt: number = 0) {
		if (await this.pgrep.isAnyBlockingSwiftProcessRunning()) {
			if (attempt <= 5) {
				if (attempt == 0 && title.length > 0) {
					status('clock', `${title} paused, awaiting another Swift process...`, StatusType.Default)
				}
				await new Promise((x) => setTimeout(x, 3000))
				await this.awaitForCompletionOfOtherSwiftProcessesIfNeeded(title, attempt + 1)
			} else {
				throw `${title} was waiting for another Swift process for too long. Try again when it has finished.`
			}
		}
	}

	setBuildingDebug(active: boolean) {
		if (!active) this.abortBuildingDebugHandler = undefined
		isBuildingDebug = active
		this.setContext(ContextKey.isBuildingDebug, active)
	}
	
	setBuildingRelease(active: boolean) {
		if (!active) this.abortBuildingReleaseHandler = undefined
		isBuildingRelease = active
		this.setContext(ContextKey.isBuildingRelease, active)
	}
	
	setHotRebuild(value?: boolean) {
		isHotRebuildEnabled = value ?? workspace.getConfiguration().get('swift.hotRebuild') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('swift.hotRebuild', value)
		sidebarTreeView?.refresh()
	}

	setClearLogBeforeBuild(value?: boolean) {
		isClearLogBeforeBuildEnabled = value ?? workspace.getConfiguration().get('swift.clearLogBeforeBuild') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('swift.clearLogBeforeBuild', value)
		sidebarTreeView?.refresh()
	}

	setShowTopRunButton() {
		const value = workspace.getConfiguration().get('swift.showTopRunButton') as boolean
		if (value !== undefined) this.setContext(ContextKey.isNavigationRunButtonEnabled, value)
	}

	setShowTopBuildButton() {
		const value = workspace.getConfiguration().get('swift.showTopBuildButton') as boolean
		if (value !== undefined) this.setContext(ContextKey.isNavigationBuildButtonEnabled, value)
	}

	setClearingCache(active: boolean = true) {
		isClearingCache = active
		sidebarTreeView?.refresh()
	}

	setClearedCache(active: boolean = true) {
		isClearedCache = active
		sidebarTreeView?.refresh()
	}

	setRestartingLSP(active: boolean = true) {
		isRestartingLSP = active
		sidebarTreeView?.refresh()
	}

	setResolvingPackages(active: boolean = true) {
		isResolvingPackages = active
		sidebarTreeView?.refresh()
	}

	setRestartedLSP(active: boolean = true) {
		isRestartedLSP = active
		sidebarTreeView?.refresh()
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
