import { TreeDataProvider, Event, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, Command, Disposable, Uri, workspace, commands } from "vscode"
import { currentLoggingLevel, currentDevPort, currentToolchain, isBuilding, isBuildingRelease, isClearingBuildCache, isDebugging, isHotRebuildEnabled, isHotReloadEnabled, isRecompilingApp, isRecompilingCSS, isRecompilingJS, isRecompilingService, containsUpdateForWeb as containsUpdateForWeb, containsUpdateForJSKit, containsServiceTarget, isClearedBuildCache, pendingNewDevPort, pendingNewToolchain, pendingNewProdPort, currentProdPort, isAnyHotBuilding, serviceWorkerTargetName, appTargetName, containsAppTarget, isRecompilingHTML, canRecompileAppTarget, canRecompileServiceTarget, isRunningCrawlServer, print } from "./webber"
import { env } from "process"
import { extensionContext, ExtensionMode, extensionMode, isInContainer, sidebarTreeViewContainer, webber } from "./extension"
import { SwiftBuildType } from "./swift"
import { doesPackageCheckedOut, KnownPackage } from "./commands/build/helpers"
import path from "node:path"
import { openDocumentInEditorOnLine } from "./helpers/openDocumentInEditor"

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

	constructor() {}

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

	async getChildren(element?: Dependency): Promise<Dependency[]> {
		var items: Dependency[] = []
		if (!isInContainer() && !env.S_DEV) {
			if (element == null) {
				items = [
					new Dependency(SideTreeItem.Project, 'Project', `${workspace.name}`, TreeItemCollapsibleState.Expanded, 'terminal-bash', false)
				]
			} else if (element?.label == SideTreeItem.Project) {
				items = [
					new Dependency(SideTreeItem.ReopenInContainer, 'Reopen in Container', '', TreeItemCollapsibleState.None, 'folder::charts.green'),
					new Dependency(SideTreeItem.WhyReopenInContainer, 'Why Reopen in Container?', '', TreeItemCollapsibleState.None, this.fileIcon('question-square')),
					new Dependency(SideTreeItem.NewProject, 'New Project', '', TreeItemCollapsibleState.None, this.fileIcon('new-project'))
				]
			}
			return items
		}
		if (element == null) {
			items.push(new Dependency(SideTreeItem.Debug, 'Debug', `${workspace.name?.split('[Dev')[0] ?? ''}`, TreeItemCollapsibleState.Expanded, 'coffee', false))
			items.push(new Dependency(SideTreeItem.Release, 'Release', '', TreeItemCollapsibleState.Collapsed, 'cloud-upload', false))
			items.push(new Dependency(SideTreeItem.Project, 'Project', '', TreeItemCollapsibleState.Collapsed, 'package', false))
			items.push(new Dependency(SideTreeItem.Maintenance, 'Maintenance', '', TreeItemCollapsibleState.Collapsed, 'tools', false))
			items.push(new Dependency(SideTreeItem.Settings, 'Settings', '', TreeItemCollapsibleState.Expanded, 'debug-configure', false))
			items.push(new Dependency(SideTreeItem.Recommendations, 'Recommendations', '', TreeItemCollapsibleState.Collapsed, 'lightbulb', false))
			items.push(new Dependency(SideTreeItem.Support, 'Support', '', TreeItemCollapsibleState.Collapsed, 'heart', false))
			for (let i = 0; i < this.errorCommands.length; i++) {
				this.errorCommands[i].dispose()
			}
			this.errorCommands = []
			if (this.errors.length > 0) {
				const eCount = this.errors.map((x) => x.errors.filter((f) => f.type == 'error')?.length ?? 0).reduce((s, a) => s + a, 0)
				const wCount = this.errors.map((x) => x.errors.filter((f) => f.type == 'warning')?.length ?? 0).reduce((s, a) => s + a, 0)
				const nCount = this.errors.map((x) => x.errors.filter((f) => f.type == 'note')?.length ?? 0).reduce((s, a) => s + a, 0)
				items.push(new Dependency(SideTreeItem.Errors, eCount > 0 ? 'Errors' : wCount > 0 ? 'Warnings' : 'Notes', `${eCount + wCount + nCount}`, TreeItemCollapsibleState.Expanded, `bracket-error::charts.${eCount > 0 ? 'red' : wCount > 0 ? 'orange' : 'white'}`, false))
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
				items.push(new Dependency(commandId, error.name, `${error.errors.length}`, TreeItemCollapsibleState.Expanded, 'file', true))
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
					items.push(new Dependency(commandId, `${place.line}: ${place.description}`, '', TreeItemCollapsibleState.None, place.type == 'note' ? 'edit::charts.white' : place.type == 'warning' ? 'alert::charts.orange' : 'error::charts.red', true))
				}
			}
		} else if (element?.id == SideTreeItem.Debug) {
			items = [
				new Dependency(SideTreeItem.Build, isBuilding || isAnyHotBuilding() ? isAnyHotBuilding() ? 'Hot Rebuilding' : 'Building' : 'Build', '', TreeItemCollapsibleState.None, isBuilding || isAnyHotBuilding() ? isAnyHotBuilding() ? 'sync~spin::charts.orange' : 'sync~spin::charts.green' : this.fileIcon('hammer')),
				new Dependency(SideTreeItem.DebugInChrome, isDebugging ? 'Debugging in Chrome' : 'Debug in Chrome', '', TreeItemCollapsibleState.None, isDebugging ? 'sync~spin::charts.blue' : 'debug-alt::charts.blue'),
				new Dependency(SideTreeItem.RunCrawlServer, isRunningCrawlServer ? 'Running Crawl Server' : 'Run Crawl Server', '', TreeItemCollapsibleState.None, isRunningCrawlServer ? 'sync~spin' : 'debug-console'),
				new Dependency(SideTreeItem.HotRebuild, 'Hot rebuild', isHotRebuildEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isHotRebuildEnabled ? 'pass::charts.green' : 'circle-large-outline'),
				new Dependency(SideTreeItem.HotReload, 'Hot reload', isHotReloadEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isHotReloadEnabled ? 'pass::charts.green' : 'circle-large-outline')
			]
		} else if (element.id == SideTreeItem.Release) {
			items.push(new Dependency(SideTreeItem.BuildRelease, isBuildingRelease ? 'Building Release' : 'Build Release', '', TreeItemCollapsibleState.None, isBuildingRelease ? 'sync~spin::charts.green' : 'globe::charts.green'))
			if (webber!.firebase.isInstalled)
				items.push(new Dependency(SideTreeItem.Firebase, 'Firebase', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('firebase3')))
			if (webber!.flyio.isInstalled)
				items.push(new Dependency(SideTreeItem.FlyIO, 'Fly.io', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('flyio3')))
			if (
				webber!.firebase.isInstalled == false
				|| webber!.flyio.isInstalled == false
			) items.push(new Dependency(SideTreeItem.AddCloudProvider, 'Add Cloud Provider', '', TreeItemCollapsibleState.Collapsed, 'cloud'))
		} else if (element.id == SideTreeItem.Firebase) {
			if (await webber!.firebase.isPresentInProject() == false) {
				items.push(new Dependency(SideTreeItem.FirebaseSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.FirebaseDeploy, webber!.firebase.isLoggingIn ? 'Logging in' : webber!.firebase.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webber!.firebase.isLoggingIn || webber!.firebase.isDeploying ? 'sync~spin' : 'cloud-upload'))
				const fullDeployMode = webber?.firebase.getFullDeployMode()
				if (fullDeployMode != undefined) {
					items.push(new Dependency(SideTreeItem.FirebaseDeployMode, 'Deploy Mode', fullDeployMode ? 'Full' : 'Hosting Only', TreeItemCollapsibleState.None, 'settings'))
				}
				items.push(new Dependency(SideTreeItem.FirebaseDeintegrate, webber!.firebase.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webber!.firebase.isDeintegrating ? 'sync~spin' : 'trash'))
			}
		} else if (element.id == SideTreeItem.FlyIO) {
			if (await webber!.flyio.isPresentInProject() == false) {
				items.push(new Dependency(SideTreeItem.FlyIOSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.FlyIODeploy, webber!.flyio.isLoggingIn ? 'Logging in' : webber!.flyio.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webber!.flyio.isLoggingIn || webber!.flyio.isDeploying ? 'sync~spin' : 'cloud-upload'))
				items.push(new Dependency(SideTreeItem.FlyIODeintegrate, webber!.flyio.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webber!.flyio.isDeintegrating ? 'sync~spin' : 'trash'))
			}
		} else if (element.id == SideTreeItem.AddCloudProvider) {
			if (webber!.firebase.isInstalled == false)
				items.push(new Dependency(SideTreeItem.AddFirebase, 'Firebase', '', TreeItemCollapsibleState.None, this.fileIcon('firebase3')))
			if (webber!.flyio.isInstalled == false)
				items.push(new Dependency(SideTreeItem.AddFlyIO, 'Fly.io', '', TreeItemCollapsibleState.None, this.fileIcon('flyio3')))
		} else if (element?.id == SideTreeItem.Project) {
			items = [
				new Dependency(SideTreeItem.NewFilePage, 'New Page', '', TreeItemCollapsibleState.None, 'file-add'),
				new Dependency(SideTreeItem.NewFileClass, 'New Class', '', TreeItemCollapsibleState.None, 'file-code'),
				new Dependency(SideTreeItem.NewFileJS, 'New JS', '', TreeItemCollapsibleState.None, 'file-code'),
				new Dependency(SideTreeItem.NewFileSCSS, 'New CSS', '', TreeItemCollapsibleState.None, 'file-code')
			]
		} else if (element.id == SideTreeItem.Maintenance) {
			items.push(new Dependency(SideTreeItem.ClearBuildCache, isClearingBuildCache ? 'Clearing Build Cache' : isClearedBuildCache ? 'Cleared Build Cache' : 'Clear Build Cache', '', TreeItemCollapsibleState.None, isClearingBuildCache ? 'sync~spin::charts.red' : isClearedBuildCache ? 'check::charts.green' : 'trash::charts.red'))
			if (await containsAppTarget() && canRecompileAppTarget())
			items.push(new Dependency(SideTreeItem.RecompileApp, isRecompilingApp ? 'Recompiling' : 'Recompile', appTargetName, TreeItemCollapsibleState.None, isRecompilingApp ? 'sync~spin' : 'repl'))
			if (await containsServiceTarget() && canRecompileServiceTarget())
				items.push(new Dependency(SideTreeItem.RecompileService, isRecompilingService ? 'Recompiling' : 'Recompile', serviceWorkerTargetName, TreeItemCollapsibleState.None, isRecompilingService ? 'sync~spin' : 'server~spin'))
			items.push(new Dependency(SideTreeItem.RecompileJS, isRecompilingJS ? 'Recompiling' : 'Recompile', 'JS', TreeItemCollapsibleState.None, isRecompilingJS ? 'sync~spin' : 'code'))
			items.push(new Dependency(SideTreeItem.RecompileCSS, isRecompilingCSS ? 'Recompiling' : 'Recompile', 'CSS', TreeItemCollapsibleState.None, isRecompilingCSS ? 'sync~spin' : 'symbol-color'))
			items.push(new Dependency(SideTreeItem.RecompileHTML, isRecompilingHTML ? 'Recompiling' : 'Recompile', 'HTML', TreeItemCollapsibleState.None, isRecompilingHTML ? 'sync~spin' : 'compass'))
		} else if (element.id == SideTreeItem.Settings) {
			items.push(new Dependency(SideTreeItem.Toolchain, 'Toolchain', `${currentToolchain.replace('swift-wasm-', '')} ${pendingNewToolchain && pendingNewToolchain != currentToolchain ? `(${pendingNewToolchain.replace('swift-wasm-', '')} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'versions'))
			items.push(new Dependency(SideTreeItem.DevPort, 'Port (debug)', `${currentDevPort} ${pendingNewDevPort && pendingNewDevPort != currentDevPort ? `(${pendingNewDevPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower'))
			items.push(new Dependency(SideTreeItem.ProdPort, 'Port (release)', `${currentProdPort} ${pendingNewProdPort && pendingNewProdPort != currentProdPort ? `(${pendingNewProdPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower'))
			items.push(new Dependency(SideTreeItem.LoggingLevel, 'Logging Level', `${currentLoggingLevel}`, TreeItemCollapsibleState.None, 'output'))
		} else if (element?.id == SideTreeItem.Recommendations) {
			if (containsUpdateForWeb)
				items.push(new Dependency(SideTreeItem.UpdateWeb, 'Update Web to 2.0.0', '', TreeItemCollapsibleState.None, 'cloud-download'))
			if (containsUpdateForJSKit)
				items.push(new Dependency(SideTreeItem.UpdateJSKit, 'Update JSKit to 0.20.0', '', TreeItemCollapsibleState.None, 'cloud-download'))
			if (items.length == 0)
				items.push(new Dependency(SideTreeItem.UpdateJSKit, 'No recommendations for now', '', TreeItemCollapsibleState.None, 'check::charts.green', false))
		} else if (element?.id == SideTreeItem.Support) {
			if (extensionMode == ExtensionMode.Web) {
				items.push(new Dependency(SideTreeItem.WebDocumentation, 'Documentation', '', TreeItemCollapsibleState.None, 'book::charts.green'))
			} else if (extensionMode == ExtensionMode.Android) {
				items.push(new Dependency(SideTreeItem.AndroidDocumentation, 'Documentation', '', TreeItemCollapsibleState.None, 'book::charts.green'))
			} else if (extensionMode == ExtensionMode.Server) {
				if (doesPackageCheckedOut(KnownPackage.Vapor)) {
					items.push(new Dependency(SideTreeItem.VaporDocumentation, 'Documentation', '', TreeItemCollapsibleState.None, 'book::charts.green'))
				} else if (doesPackageCheckedOut(KnownPackage.Hummingbird)) {
					items.push(new Dependency(SideTreeItem.HummingbirdDocumentation, 'Documentation', '', TreeItemCollapsibleState.None, 'book::charts.green'))
				} else {
					items.push(new Dependency(SideTreeItem.ServerDocumentation, 'Documentation', '', TreeItemCollapsibleState.None, 'book::charts.green'))
				}
			}
			items.push(new Dependency(SideTreeItem.Repository, 'Repository', '', TreeItemCollapsibleState.None, 'github-inverted'))
			items.push(new Dependency(SideTreeItem.Discussions, 'Discussions', '', TreeItemCollapsibleState.None, 'comment-discussion::charts.purple'))
			items.push(new Dependency(SideTreeItem.SubmitAnIssue, 'Submit an issue', '', TreeItemCollapsibleState.None, 'pencil::charts.orange'))
		}
		return items
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
	constructor(
		public readonly id: string,
		public readonly label: string,
		private readonly version: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly iconPath: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon,
		private readonly commandPresent: boolean = true
	) {
		super(label, collapsibleState)
		this.id = id
		this.contextValue = id
		this.tooltip = label
		this.description = this.version
		if (typeof iconPath === 'string' || iconPath instanceof String) {
			const splitted = iconPath.split('::')
			if (splitted.length == 2) {
				this.iconPath = new ThemeIcon(`${splitted[0]}`, new ThemeColor(`${splitted[1]}`))
			} else {
				this.iconPath = new ThemeIcon(`${iconPath}`)
			}
		} else {
			this.iconPath = iconPath
		}
		if (commandPresent) {
			this.command = new DepCommand(label, id)
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
		Build = 'Build',
		DebugInChrome = 'DebugInChrome',
		RunCrawlServer = 'RunCrawlServer',
		HotReload = 'HotReload',
		HotRebuild = 'HotRebuild',
	Release = 'Release',
		BuildRelease = 'BuildRelease',
		Firebase = 'Firebase',
			FirebaseSetup = 'FirebaseSetup',
			FirebaseDeployMode = 'FirebaseDeployMode',
			FirebaseDeploy = 'FirebaseDeployHosting',
			FirebaseDeintegrate = 'FirebaseDeintegrate',
		FlyIO = 'FlyIO',
			FlyIOSetup = 'FlyIOSetup',
			FlyIODeploy = 'FlyIODeploy',
			FlyIODeintegrate = 'FlyIODeintegrate',
		AddCloudProvider = 'AddCloudProvider',
			AddFirebase = 'AddFirebase',
			AddFlyIO = 'AddFlyIO',
	Project = 'Project',
		NewFilePage = 'NewFilePage',
		NewFileClass = 'NewFileClass',
		NewFileJS = 'NewFileJS',
		NewFileSCSS = 'NewFileCSS',
	Maintenance = 'Maintenance',
		ClearBuildCache = 'ClearBuildCache',
		RecompileApp = 'RecompileApp',
		RecompileService = 'RecompileService',
		RecompileJS = 'RecompileJS',
		RecompileCSS = 'RecompileCSS',
		RecompileHTML = 'RecompileHTML',
	Settings = 'Settings',
		Toolchain = 'Toolchain',
		DevPort = 'DevPort',
		ProdPort = 'ProdPort',
		LoggingLevel = 'LoggingLevel',
	Recommendations = 'Recommendations',
		UpdateWeb = 'UpdateWeb',
		UpdateJSKit = 'UpdateJSKit',
	Support = 'Support',
		WebDocumentation = 'WebDocumentation',
		AndroidDocumentation = 'AndroidDocumentation',
		VaporDocumentation = 'VaporDocumentation',
		HummingbirdDocumentation = 'HummingbirdDocumentation',
		ServerDocumentation = 'ServerDocumentation',
		Repository = 'Repository',
		Discussions = 'Discussions',
		SubmitAnIssue = 'SubmitAnIssue'
}