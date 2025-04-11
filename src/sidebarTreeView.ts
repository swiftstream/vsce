import path from 'node:path'
import { env } from 'process'
import { TreeDataProvider, Event, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, Command, Disposable, Uri, workspace, commands, TreeViewExpansionEvent, window } from 'vscode'
import { isBuildingDebug, isBuildingRelease, isHotRebuildEnabled, isClearingCache, isClearedCache, currentLoggingLevel, isTesting, isTestable, isRestartingLSP, isRestartedLSP, isClearLogBeforeBuildEnabled, isResolvingPackages } from './streams/stream'
import { extensionContext, ExtensionStream, extensionStream, isInContainer, currentStream } from './extension'
import { openDocumentInEditorOnLine } from './helpers/openDocumentInEditor'
import { isCIS } from './helpers/language'
import { currentToolchain, pendingNewToolchain } from './toolchain'
import { DevContainerConfig } from './devContainerConfig'

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
export interface MountedItem {
	source: string,
	target: string,
	bind: boolean,
	permanent: boolean,
	pending: boolean
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

	initialMounts: any[] = []
	mountedItems: MountedItem[] = []
	mountCommands: Disposable[] = []

	constructor() {
		this.updateExpandedItems()
		this.initialMounts = DevContainerConfig.listMounts()
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

	private mountsItem(): Dependency {
		for (let i = 0; i < this.mountCommands.length; i++) {
			this.mountCommands[i].dispose()
		}
		this.mountCommands = []
		this.mountedItems = DevContainerConfig.listMounts().map(x => {
			return {
				source: x.source,
				target: x.target,
				bind: x.type === 'bind',
				permanent: DevContainerConfig.permanentMountSources.includes(x.source),
				pending: this.initialMounts.findIndex(m => m.source === x.source) === -1
			}
		}).sort((a, b) => {
			const rank = (item: MountedItem) => {
				if (!item.bind && item.permanent) return 0
				if (!item.bind && !item.permanent) return 1
				return 2
			}
			return rank(a) - rank(b)
		})
		const itemsToRegister = this.mountedItems.filter(m => !m.permanent)
		for (let i = 0; i < itemsToRegister.length; i++) {
			const mounted = itemsToRegister[i]
			const commandId = `${SideTreeItem.MountedItem}:${mounted.source}`
			const command = commands.registerCommand(commandId, async () => {
				const action = mounted.pending ? 'Delete' : 'Unmount'
				switch (await window.showQuickPick([action, 'Cancel'], {
					placeHolder: `Would you like to ${action.toLowerCase()} ${mounted.source}${mounted.bind ? '' : ' volume'}?`
				})) {
					case action:
						DevContainerConfig.transaction(c => c.removeMount(m => m.source === mounted.source))
						this.refresh()
						switch (await window.showInformationMessage(`${mounted.bind ? 'The item' : 'Volume'} will be unmounted at after the continer is rebuilt.`, 'Rebuild Now', 'Later')) {
							case 'Rebuild Now':
								await commands.executeCommand('remote-containers.rebuildContainer')
								break
							default: break
						}
						break
					default: break
				}
			})
			extensionContext.subscriptions.push(command)
			this.errorCommands.push(command)
		}
		return new Dependency({
			id: SideTreeItem.Mounts,
			label: 'Mounts',
			version: `${this.mountedItems.length}`,
			tooltip: 'Mounted volumes, files, and folders from the host machine',
			state: TreeItemCollapsibleState.Collapsed,
			icon: 'file-submodule',
			skipCommand: true
		})
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
				if (await currentStream.isThereInstalledFeatures()) {
					items.push(...(await currentStream.installedFeatureItems()))
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
				items.push(new Dependency({
					id: SideTreeItem.Container,
					label: 'Dev Container',
					state: this.expandState(SideTreeItem.Container),
					icon: 'remote-explorer',
					skipCommand: true
				}))
				if (await currentStream.isThereFeaturesToAdd()) {
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
						tooltip: 'Cmd+B or Ctrl+B',
						label: isBuildingDebug || currentStream.isAnyHotBuilding() ? currentStream.isAnyHotBuilding() ? 'Hot Rebuilding' : 'Building' : 'Build',
						icon: isBuildingDebug || currentStream.isAnyHotBuilding() ? currentStream.isAnyHotBuilding() ? 'sync~spin::charts.orange' : 'sync~spin::charts.green' : this.fileIcon('hammer')
					}))
				}
				items.push(...(await currentStream.debugActionItems()))
				if (isTestable) {
					items.push(new Dependency({
						id: SideTreeItem.Test,
						tooltip: 'Cmd+U or Ctrl+U',
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
				items.push(...(await currentStream.defaultReleaseItems()))
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
			case SideTreeItem.Container:
				items.push(this.mountsItem())
				items.push(new Dependency({
					id: SideTreeItem.SSH,
					label: 'SSH Agent',
					tooltip: 'The SSH agent provides transparent access to SSH keys located on your host machine',
					state: TreeItemCollapsibleState.Collapsed,
					icon: 'shield',
					skipCommand: true
				}))
				items.push(new Dependency({
					id: SideTreeItem.RebuildContainer,
					label: 'Rebuild',
					tooltip: 'Rebuilds dev container',
					icon: 'history'
				}))
				items.push(new Dependency({
					id: SideTreeItem.RebuildContainerWithoutCache,
					label: 'Rebuild',
					version: 'Without Cache',
					tooltip: 'Rebuilds dev container without cache',
					icon: 'history'
				}))
				items.push(new Dependency({
					id: SideTreeItem.LocalTerminal,
					label: 'Local Terminal',
					tooltip: 'Access to the terminal on your host machine',
					icon: 'console'
				}))
				break
			case SideTreeItem.Mounts:
				items.push(new Dependency({
					id: SideTreeItem.MountNewItem,
					label: 'Add Mount',
					tooltip: 'Click to mount a new volume, file, or folder from the host machine',
					icon: 'add'
				}))
				for (let i = 0; i < this.mountedItems.length; i++) {
					const mount = this.mountedItems[i]
					items.push(new Dependency({
						id: `${SideTreeItem.MountedItem}:${mount.source}`,
						label: path.basename(mount.source),
						version: mount.target,
						tooltip: (mount.permanent ? 'Permanent item required for the Swift Stream container to work properly' : `Click to ${mount.pending ? 'delete' : 'unmount'}`),
						icon: mount.bind ? 'file-symlink-directory' : this.fileIcon('drive'),
						skipCommand: mount.permanent
					}))
				}
				break
			case SideTreeItem.SSH:
				items.push(new Dependency({
					id: SideTreeItem.CheckSSH,
					label: 'Check',
					version: 'Loaded Keys',
					tooltip: 'Check if SSH keys are loaded',
					icon: 'git-fetch'
				}))
				items.push(new Dependency({
					id: SideTreeItem.CheckGithubAccess,
					label: 'Check',
					version: 'Github Access',
					tooltip: 'Check if you have access to GitHub using your SSH keys',
					icon: 'github-alt'
				}))
				items.push(new Dependency({
					id: SideTreeItem.SSHHostInstructions,
					label: 'Host Instructions',
					tooltip: 'Click to get instructions on how to set up the SSH agent on the host machine',
					icon: 'inspect'
				}))
				break
			case SideTreeItem.Features:
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
				items.push(new Dependency({
					id: SideTreeItem.ResolvePackages,
					label: isResolvingPackages ? 'Resolving Packages' : isResolvingPackages ? 'Resolved Packages' : 'Resolve Packages',
					icon: isResolvingPackages ? 'sync~spin::charts.yellow' : isResolvingPackages ? 'check::charts.green' : 'clone::charts.yellow'
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
				items.push(new Dependency({
					id: SideTreeItem.AdvancedSettings,
					label: 'Advanced',
					state: this.expandState(SideTreeItem.AdvancedSettings),
					icon: 'tools'
				}))
				break
			case SideTreeItem.AdvancedSettings:
				items.push(new Dependency({
					id: SideTreeItem.ClearLogOnRebuild,
					label: 'Clear Log Before Build',
					version: isClearLogBeforeBuildEnabled ? 'Enabled' : 'Disabled',
					icon: isClearLogBeforeBuildEnabled ? 'pass' : 'circle-large-outline'
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
				items.push(new Dependency({
					id: SideTreeItem.ContactAuthor,
					label: 'Mikhail Isaev',
					version: 'the author',
					tooltip: 'Mikhail Isaev is the author of this VSCode extension',
					icon: 'mention',
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
		icon?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon | undefined,
		skipCommand?: boolean
	}) {
		super(options.label, options.state ?? TreeItemCollapsibleState.None)
		this.id = options.id
		this.contextValue = options.id
		this.tooltip = options.tooltip ?? options.label
		this.description = options.version ?? ''
		if (options.icon) {
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
	Container = 'Container',
		Mounts = 'MountedFolders',
			MountedItem = 'MountedFolderItem',
			MountNewItem = 'MountedFolderAdd',
		SSH = 'SSH',
			CheckSSH = 'CheckSSH',
			CheckGithubAccess = 'CheckGithubAccess',
			SSHHostInstructions = 'HostSSHCommand',
		RebuildContainer = 'RebuildContainer',
		RebuildContainerWithoutCache = 'RebuildContainerWithoutCache',
		LocalTerminal = 'LocalTerminal',
	Maintenance = 'Maintenance',
		ClearCaches = 'ClearCaches',
		RestartLSP = 'RestartLSP',
		ResolvePackages = 'ResolvePackages',
		RecompileApp = 'RecompileApp',
		RecompileService = 'RecompileService',
		RecompileJS = 'RecompileJS',
		RecompileCSS = 'RecompileCSS',
		RecompileHTML = 'RecompileHTML',
		CopyResources = 'CopyResources',
	Settings = 'Settings',
		Toolchain = 'Toolchain',
		Port = 'Port',
		DevPort = 'DevPort',
		DevCrawlerPort = 'DevCrawlerPort',
		ProdPort = 'ProdPort',
		LoggingLevel = 'LoggingLevel',
		AdvancedSettings = 'AdvancedSettings',
			ClearLogOnRebuild = 'ClearLogOnRebuild',
	Features = 'Features',
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
		OpenSwiftForums = 'OpenSwiftForums',
		ContactAuthor = 'ContactAuthor'
}