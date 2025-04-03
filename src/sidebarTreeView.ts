import path from 'node:path'
import { env } from 'process'
import { TreeDataProvider, Event, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, Command, Disposable, Uri, workspace, commands, TreeViewExpansionEvent } from 'vscode'
import { isBuildingDebug, isBuildingRelease, isHotRebuildEnabled, isClearingCache, isClearedCache, currentLoggingLevel, isTesting, isTestable, isRestartingLSP, isRestartedLSP } from './streams/stream'
import { extensionContext, ExtensionStream, extensionStream, isInContainer, currentStream } from './extension'
import { openDocumentInEditorOnLine } from './helpers/openDocumentInEditor'
import { isCIS } from './helpers/language'
import { currentToolchain, pendingNewToolchain } from './toolchain'

export interface ErrorInFile {
	type: string,
	line: number,
	point: number,
	lineWithCode: string,
	description: string
}

export interface FileWithError {
	path: string,
	name: string,
	errors: ErrorInFile[]
}

export class SidebarTreeView implements TreeDataProvider<Dependency> {
	private _onDidChangeTreeData: EventEmitter<Dependency | undefined | void> = new EventEmitter<Dependency | undefined | void>()
	readonly onDidChangeTreeData: Event<Dependency | undefined | void> = this._onDidChangeTreeData.event

	errors: FileWithError[] = []
	errorCommands: Disposable[] = []

	cleanupErrors() {
		this.errors = []
	}

	addFileWithError(file: FileWithError) {
		var existingFile = this.errors.find((f) => f.path == file.path)
		if (existingFile) {
			for (let i = 0; i < file.errors.length; i++) {
				const error = file.errors[i]
				const existingError = existingFile.errors.find((e) => e.type == error.type && e.line == error.line && e.description == error.description)
				if (existingError === undefined) {
					existingFile.errors.push(error)
				}
			}
		} else {
			this.errors.push(file)
		}
	}

	constructor() {
		this.updateExpandedItems()
	}

	refresh(): void {
		this._onDidChangeTreeData.fire()
	}

	getTreeItem(element: Dependency): TreeItem {
		return element
	}

	flag = false

	fileIcon(light: string, dark?: string | undefined) {
		return { light: path.join(__filename, '..', '..', 'assets', 'icons', `${light}.svg`), dark: path.join(__filename, '..', '..', 'assets', 'icons', `${dark ?? light}.svg`) }
	}

	private fillNewErrors(): Dependency | undefined {
		for (let i = 0; i < this.errorCommands.length; i++) {
			this.errorCommands[i].dispose()
		}
		this.errorCommands = []
		if (this.errors.length > 0) {
			const eCount = this.errors.map((x) => x.errors.filter((f) => f.type == 'error')?.length ?? 0).reduce((s, a) => s + a, 0)
			const wCount = this.errors.map((x) => x.errors.filter((f) => f.type == 'warning')?.length ?? 0).reduce((s, a) => s + a, 0)
			const nCount = this.errors.map((x) => x.errors.filter((f) => f.type == 'note')?.length ?? 0).reduce((s, a) => s + a, 0)
			return new Dependency({
				id: SideTreeItem.Errors,
				label: eCount > 0 ? 'Errors' : wCount > 0 ? 'Warnings' : 'Notes',
				version: `${eCount + wCount + nCount}`,
				state: TreeItemCollapsibleState.Expanded,
				icon: `bracket-error::charts.${eCount > 0 ? 'red' : wCount > 0 ? 'orange' : 'white'}`,
				skipCommand: true
			})
		}
		return undefined
	}

	async getChildren(element?: Dependency): Promise<Dependency[]> {
		var items: Dependency[] = []
		if (!isInContainer() && !env.S_DEV) {
			if (element == null) {
				items = [
					new Dependency({
						id: SideTreeItem.Project,
						label: 'Project',
						version: `${workspace.name}`,
						state: TreeItemCollapsibleState.Expanded,
						icon: 'terminal-bash',
						skipCommand: true
					})
				]
			} else if (element?.label == SideTreeItem.Project) {
				items = [
					new Dependency({
						id: SideTreeItem.ReopenInContainer,
						label: 'Reopen in Container',
						icon: 'folder::charts.green'
					}),
					new Dependency({
						id: SideTreeItem.WhyReopenInContainer,
						label: 'Why Reopen in Container?',
						icon: this.fileIcon('question-square')
					}),
					// new Dependency({
					// 	id: SideTreeItem.NewProject,
					// 	label: 'New Project',
					// 	icon: this.fileIcon('new-project')
					// })
				]
			}
			return items
		}
		if (element == null) {
			if (currentStream) {
				items.push(new Dependency({
					id: SideTreeItem.Debug,
					label: 'Debug',
					version: `${workspace.name?.split('[Dev')[0] ?? ''}`,
					state: this.expandState(SideTreeItem.Debug),
					icon: 'coffee',
					skipCommand: true
				}))
				items.push(new Dependency({
					id: SideTreeItem.Release,
					label: 'Release',
					state: this.expandState(SideTreeItem.Release),
					icon: 'cloud-upload',
					skipCommand: true
				}))
				const projectItems = await currentStream!.projectItems()
				if (projectItems.length > 0) {
					items.push(new Dependency({
						id: SideTreeItem.Project,
						label: 'Project',
						state: this.expandState(SideTreeItem.Project),
						icon: 'package',
						skipCommand: true
					}))
				}
				items.push(new Dependency({
					id: SideTreeItem.Maintenance,
					label: 'Maintenance',
					state: this.expandState(SideTreeItem.Maintenance),
					icon: 'tools',
					skipCommand: true
				}))
				items.push(new Dependency({
					id: SideTreeItem.Settings,
					label: 'Settings',
					state: this.expandState(SideTreeItem.Settings),
					icon: 'debug-configure',
					skipCommand: true
				}))
				if (await currentStream.isThereAnyFeature()) {
					items.push(new Dependency({
						id: SideTreeItem.Features,
						label: 'Features',
						state: this.expandState(SideTreeItem.Features),
						icon: 'extensions',
						skipCommand: true
					}))
				}
				if (await currentStream.isThereAnyRecommendation()) {
					items.push(new Dependency({
						id: SideTreeItem.Recommendations,
						label: 'Recommendations',
						state: this.expandState(SideTreeItem.Recommendations),
						icon: 'lightbulb',
						skipCommand: true
					}))
				}
				items.push(new Dependency({
					id: SideTreeItem.Support,
					label: 'Support',
					state: this.expandState(SideTreeItem.Support),
					icon: 'heart',
					skipCommand: true
				}))
				const errorsItem = this.fillNewErrors()
				if (errorsItem) {
					items.push(errorsItem)
				}
			}
		} else if (element?.id == SideTreeItem.Errors) {
			for (let i = 0; i < this.errors.length; i++) {
				const error = this.errors[i]
				const commandId = `${SideTreeItem.ErrorFile}:${error.path}`
				const command = commands.registerCommand(commandId, async () => {
					if (error.errors.length > 0 && error.errors[0]) {
						const place = error.errors[0]
						await openDocumentInEditorOnLine(error.path, place.line, place.point > 0 ? place.point - 1 : 0)
					}
				})
				extensionContext.subscriptions.push(command)
				this.errorCommands.push(command)
				items.push(new Dependency({
					id: commandId,
					label: error.name,
					version: `${error.errors.length}`,
					state: TreeItemCollapsibleState.Expanded,
					icon: 'file'
				}))
			}
		} else if (element?.id && element.id.startsWith(`${SideTreeItem.ErrorFile}:`)) {
			const path = element.id.replace(`${SideTreeItem.ErrorFile}:`, '')
			const error = this.errors.find((x) => x.path == path)
			if (error) {
				for (let i = 0; i < error.errors.length; i++) {
					const place = error.errors[i]
					const commandId = `${SideTreeItem.ErrorPoint}:${error.path}:${place.line}:${place.point}${place.description}`
					const command = commands.registerCommand(commandId, async () => {
						await openDocumentInEditorOnLine(error.path, place.line, place.point > 0 ? place.point - 1 : 0)
					})
					extensionContext.subscriptions.push(command)
					this.errorCommands.push(command)
					items.push(new Dependency({
						id: commandId,
						label: `${place.line}: ${place.description}`,
						icon: place.type == 'note' ? 'edit::charts.white' : place.type == 'warning' ? 'alert::charts.orange' : 'error::charts.red'
					}))
				}
			}
		} else if (currentStream && element?.id) {
			switch (element.id) {
			case SideTreeItem.Debug:
				// Actions
				const defaultItems = await currentStream.defaultDebugActionItems()
				if (defaultItems.length > 0) {
					items.push(...defaultItems)
				} else {
					items.push(new Dependency({
						id: SideTreeItem.BuildDebug,
						label: isBuildingDebug || currentStream.isAnyHotBuilding() ? currentStream.isAnyHotBuilding() ? 'Hot Rebuilding' : 'Building' : 'Build',
						icon: isBuildingDebug || currentStream.isAnyHotBuilding() ? currentStream.isAnyHotBuilding() ? 'sync~spin::charts.orange' : 'sync~spin::charts.green' : this.fileIcon('hammer')
					}))
				}
				items.push(...(await currentStream.debugActionItems()))
				if (isTestable) {
					items.push(new Dependency({
						id: SideTreeItem.Test,
						label: isTesting ? 'Testing' : 'Test',
						icon: isTesting ? 'sync~spin::charts.green' : 'beaker::charts.green'
					}))
				}
				// Options
				items.push(new Dependency({
					id: SideTreeItem.HotRebuild,
					label: 'Hot rebuild',
					version: isHotRebuildEnabled ? 'Enabled' : 'Disabled',
					icon: isHotRebuildEnabled ? 'pass::charts.green' : 'circle-large-outline'
				}))
				items.push(...(await currentStream.debugOptionItems()))
				break
			case SideTreeItem.Release:
				items.push(new Dependency({
					id: SideTreeItem.BuildRelease,
					label: isBuildingRelease ? 'Building' : 'Build',
					version: currentStream?.swift.selectedReleaseTarget ? currentStream.swift.selectedReleaseTarget : '',
					icon: isBuildingRelease ? 'sync~spin::charts.green' : 'globe::charts.green'
				}))
				items.push(...(await currentStream.releaseItems()))
				break
			case SideTreeItem.Project:
				items.push(...(await currentStream.projectItems()))
				break
			case SideTreeItem.Features:
				if (await currentStream.isThereInstalledFeatures()) {
					items.push(...(await currentStream.installedFeatureItems()))
					if (await currentStream.isThereFeaturesToAdd()) {
						items.push(new Dependency({
							id: SideTreeItem.FeaturesCollection,
							label: 'Collection',
							state: TreeItemCollapsibleState.Collapsed,
							icon: 'library'
						}))
					}
				} else {
					items.push(...(await currentStream.addFeatureItems()))
				}
				break
			case SideTreeItem.FeaturesCollection:
				items.push(...(await currentStream.addFeatureItems()))
				break
			case SideTreeItem.Maintenance:
				items.push(new Dependency({
					id: SideTreeItem.ClearCaches,
					label: isClearingCache ? 'Clearing Caches' : isClearedCache ? 'Cleared Caches' : 'Clear Caches',
					icon: isClearingCache ? 'sync~spin::charts.red' : isClearedCache ? 'check::charts.green' : 'trash::charts.red'
				}))
				items.push(new Dependency({
					id: SideTreeItem.RestartLSP,
					label: isRestartingLSP ? 'Restarting LSP' : isRestartedLSP ? 'Restarted LSP' : 'Restart LSP',
					icon: isRestartingLSP ? 'sync~spin::charts.yellow' : isRestartedLSP ? 'check::charts.green' : 'debug-restart::charts.yellow'
				}))
				items.push(...(await currentStream.maintenanceItems()))
				break
			case SideTreeItem.Settings:
				items.push(new Dependency({
					id: SideTreeItem.Toolchain,
					label: 'Toolchain',
					version: `${currentToolchain.replace('swift-wasm-', '')} ${pendingNewToolchain && pendingNewToolchain != currentToolchain ? `(${pendingNewToolchain.replace('swift-wasm-', '')} pending reload)` : ''}`,
					icon: 'versions'
				}))
				items.push(...(await currentStream.settingsItems()))
				items.push(new Dependency({
					id: SideTreeItem.LoggingLevel,
					label: 'Logging Level',
					version: `${currentLoggingLevel}`,
					icon: 'output'
				}))
				break
			case SideTreeItem.Recommendations:
				items.push(...(await currentStream.recommendationsItems()))
				break
			case SideTreeItem.Support:
				items.push(new Dependency({
					id: SideTreeItem.Documentation,
					label: 'Documentation',
					icon: 'book::charts.green'
				}))
				if (![ExtensionStream.Pure, ExtensionStream.Unknown].includes(extensionStream)) {
					items.push(new Dependency({
						id: SideTreeItem.Repository,
						label: 'Repository',
						icon: 'github-inverted'
					}))
					items.push(new Dependency({
						id: SideTreeItem.Discussions,
						label: 'Discussions',
						icon: 'comment-discussion::charts.purple'
					}))
					items.push(new Dependency({
						id: SideTreeItem.SubmitAnIssue,
						label: 'Submit an issue',
						icon: 'pencil::charts.orange'
					}))
				}
				items.push(new Dependency({
					id: SideTreeItem.OpenDiscord,
					label: 'Discord',
					icon: this.fileIcon('discord')
				}))
				if (isCIS()) {
					items.push(new Dependency({
						id: SideTreeItem.OpenTelegram,
						label: 'Telegram',
						icon: this.fileIcon('telegram')
					}))
				}
				items.push(new Dependency({
					id: SideTreeItem.OpenSwiftForums,
					label: 'Swift Forums',
					icon: this.fileIcon('swift_forums')
				}))
				break
			default:
				items.push(...(await currentStream.customItems(element)))
				break
			}
		}
		return items
	}

	// MARK: Collapsible State

	private expandableItems: SideTreeItem[] = [
		SideTreeItem.Debug,
		SideTreeItem.Release,
		SideTreeItem.Project,
		SideTreeItem.Maintenance,
		SideTreeItem.Settings,
		SideTreeItem.Features,
		SideTreeItem.Recommendations,
		SideTreeItem.Support
	]
	private collapsedByDefault: SideTreeItem[] = [
		SideTreeItem.Features,
		SideTreeItem.Recommendations,
	]
	private expandedItems: any = {}
	
	private expandState(item: SideTreeItem): TreeItemCollapsibleState {
		if (!this.expandableItems.includes(item))
			return TreeItemCollapsibleState.Collapsed
		const settings = workspace.getConfiguration().get('menu.state') as object
		if (settings[item] === undefined) {
			if (this.collapsedByDefault.includes(item)) {
				return TreeItemCollapsibleState.Collapsed
			}
			return TreeItemCollapsibleState.Expanded
		}
		if (settings[item] === true)
			return TreeItemCollapsibleState.Expanded
		return TreeItemCollapsibleState.Collapsed
	}

	private updateExpandedItems() {
		const settings = workspace.getConfiguration().get('menu.state') as object
		this.expandedItems = {}
		for (let i = 0; i < this.expandableItems.length; i++) {
			const item = this.expandableItems[i]
			this.expandedItems[item] = (settings[item] as boolean) === true
		}
	}

	private setItemExpanded(item: SideTreeItem, value: boolean) {
		this.expandedItems[item] = value
		let settings = workspace.getConfiguration().get('menu.state') as object
		settings[item] = value
		workspace.getConfiguration().update('menu.state', settings)
	}

	onDidCollapseElement(e: TreeViewExpansionEvent<Dependency>) {
		const item = this.expandableItems.find((x) => `${x}` === e.element.id)
		if (!item) return
		this.setItemExpanded(item, false)
	}

	onDidExpandElement(e: TreeViewExpansionEvent<Dependency>) {
		const item = this.expandableItems.find((x) => `${x}` === e.element.id)
		if (!item) return
		this.setItemExpanded(item, true)
	}
}

export class DepCommand implements Command {
	constructor(
		public readonly title: string,
		public readonly command: string,
		public readonly tooltip?: string | undefined
	) {}
}

export class Dependency extends TreeItem {
	id: string
	
	constructor(options: {
		id: string,
		label: string,
		tooltip?: string,
		version?: string,
		state?: TreeItemCollapsibleState,
		icon: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon,
		skipCommand?: boolean
	}) {
		super(options.label, options.state ?? TreeItemCollapsibleState.None)
		this.id = options.id
		this.contextValue = options.id
		this.tooltip = options.tooltip ?? options.label
		this.description = options.version ?? ''
		if (typeof options.icon === 'string' || options.icon instanceof String) {
			const splitted = options.icon.split('::')
			if (splitted.length == 2) {
				this.iconPath = new ThemeIcon(`${splitted[0]}`, new ThemeColor(`${splitted[1]}`))
			} else {
				this.iconPath = new ThemeIcon(`${options.icon}`)
			}
		} else {
			this.iconPath = options.icon
		}
		if (!options.skipCommand) {
			this.command = new DepCommand(options.label, options.id)
		}
	}

	// iconPath = '$(sync~spin)'
	// iconPath = {
	// 	light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
	// 	dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
	// }
}

export enum SideTreeItem {
	Errors = 'Errors',
		ErrorFile = 'ErrorFile',	
			ErrorPoint = 'ErrorPoint',
	Debug = 'Debug',
		ReopenInContainer = 'ReopenInContainer',
		WhyReopenInContainer = 'WhyReopenInContainer',
		NewProject = 'NewProject',
		BuildDebug = 'BuildDebug',
		RunDebug = 'RunDebug',
		Test = 'Test',
		DebugInChrome = 'DebugInChrome',
		RunCrawlServer = 'RunCrawlServer',
		RunNgrok = 'RunNgrok',
		HotReload = 'HotReload',
		HotRebuild = 'HotRebuild',
		DebugGzip = 'DebugGzip',
		DebugBrotli = 'DebugBrotli',
	Release = 'Release',
		BuildRelease = 'BuildRelease',
		RunRelease = 'RunRelease',
	Project = 'Project',
		NewFilePage = 'NewFilePage',
		NewFileClass = 'NewFileClass',
		NewFileJS = 'NewFileJS',
		NewFileSCSS = 'NewFileCSS',
	Maintenance = 'Maintenance',
		ClearCaches = 'ClearCaches',
		RestartLSP = 'RestartLSP',
		RecompileApp = 'RecompileApp',
		RecompileService = 'RecompileService',
		RecompileJS = 'RecompileJS',
		RecompileCSS = 'RecompileCSS',
		RecompileHTML = 'RecompileHTML',
	Settings = 'Settings',
		Toolchain = 'Toolchain',
		Port = 'Port',
		DevPort = 'DevPort',
		DevCrawlerPort = 'DevCrawlerPort',
		ProdPort = 'ProdPort',
		LoggingLevel = 'LoggingLevel',
	Features = 'Features',
		FeaturesCollection = 'FeaturesCollection',
		AddNginx = 'AddNginx',
		Nginx = 'Nginx',
			NginxRestart = 'NginxRestart',
			NginxEditConfig = 'NginxEditConfig',
			NginxResetConfig = 'NginxResetConfig',
			NginxDeintegrate = 'NginxDeintegrate',
		AddNgrok = 'AddNgrok',
		Ngrok = 'Ngrok',
			NgrokRun = 'NgrokRun',
			NgrokStop = 'NgrokStop',
			NgrokEditConfig = 'NgrokEditConfig',
			NgrokDeintegrate = 'NgrokDeintegrate',
		AddFirebase = 'AddFirebase',
		Firebase = 'Firebase',
			FirebaseSetup = 'FirebaseSetup',
			FirebaseDeployMode = 'FirebaseDeployMode',
			FirebaseDeploy = 'FirebaseDeployHosting',
			FirebaseDeintegrate = 'FirebaseDeintegrate',
	Recommendations = 'Recommendations',
		UpdateWeb = 'UpdateWeb',
		UpdateJSKit = 'UpdateJSKit',
	Support = 'Support',
		Documentation = 'Documentation',
		Repository = 'Repository',
		Discussions = 'Discussions',
		SubmitAnIssue = 'SubmitAnIssue',
		OpenDiscord = 'OpenDiscord',
		OpenTelegram = 'OpenTelegram',
		OpenSwiftForums = 'OpenSwiftForums'
}