import { TreeDataProvider, Event, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, Command, Uri, workspace } from "vscode"
import { currentLoggingLevel, currentDevPort, currentToolchain, isBuilding, isBuildingRelease, isClearingBuildCache, isDebugging, isDeployingToFirebase, isHotRebuildEnabled, isHotReloadEnabled, isRecompilingApp, isRecompilingSCSS, isRecompilingJS, isRecompilingService, containsUpdateForSwifweb, containsUpdateForJSKit, containsService, containsSCSS, containsJS, isClearedBuildCache, pendingNewDevPort, pendingNewToolchain, pendingNewProdPort, currentProdPort, isAnyHotBuilding } from "./webber"
import { env } from "process"
import { isInContainer } from "./extension"

export class SidebarTreeView implements TreeDataProvider<Dependency> {
	private _onDidChangeTreeData: EventEmitter<Dependency | undefined | void> = new EventEmitter<Dependency | undefined | void>()
	readonly onDidChangeTreeData: Event<Dependency | undefined | void> = this._onDidChangeTreeData.event

	constructor() {
	}

	refresh(): void {
		this._onDidChangeTreeData.fire()
	}

	getTreeItem(element: Dependency): TreeItem {
		return element
	}

	flag = false

	async getChildren(element?: Dependency): Promise<Dependency[]> {
		var items: Dependency[] = []
		if (!isInContainer() && !env.S_DEV) {
			if (element == null) {
				items = [
					new Dependency(SideTreeItem.Project, 'Project', `${workspace.name}`, TreeItemCollapsibleState.Expanded, 'terminal-bash', false)
				]
			} else if (element?.label == SideTreeItem.Project) {
				items = [
					new Dependency(SideTreeItem.ReopenInContainer, 'Reopen in Container', '', TreeItemCollapsibleState.None, 'folder::charts.green')
				]
			}
			return items
		}
		if (element == null) {
			items.push(new Dependency(SideTreeItem.Debug, 'Debug', `${workspace.name?.split('[Dev')[0] ?? ''}`, TreeItemCollapsibleState.Expanded, 'coffee', false))
			items.push(new Dependency(SideTreeItem.Release, 'Release', '', TreeItemCollapsibleState.Expanded, 'cloud-upload', false))
			items.push(new Dependency(SideTreeItem.Project, 'Project', '', TreeItemCollapsibleState.Collapsed, 'package', false))
			items.push(new Dependency(SideTreeItem.Maintenance, 'Maintenance', '', TreeItemCollapsibleState.Collapsed, 'tools', false))
			items.push(new Dependency(SideTreeItem.Settings, 'Settings', '', TreeItemCollapsibleState.Expanded, 'debug-configure', false))
			items.push(new Dependency(SideTreeItem.Recommendations, 'Recommendations', '', TreeItemCollapsibleState.Collapsed, 'lightbulb', false))
			items.push(new Dependency(SideTreeItem.Support, 'Support', '', TreeItemCollapsibleState.Expanded, 'heart', false))
		} else if (element?.id == SideTreeItem.Debug) {
			items = [
				new Dependency(SideTreeItem.Build, isBuilding || isAnyHotBuilding() ? isAnyHotBuilding() ? 'Hot Rebuilding' : 'Building' : 'Build', '', TreeItemCollapsibleState.None, isBuilding || isAnyHotBuilding() ? isAnyHotBuilding() ? 'sync~spin::charts.orange' : 'sync~spin::charts.green' : 'run::charts.green'),
				new Dependency(SideTreeItem.DebugInChrome, isDebugging ? 'Debugging in Chrome' : 'Debug in Chrome', '', TreeItemCollapsibleState.None, isDebugging ? 'sync~spin::charts.blue' : 'debug-alt::charts.blue'),
				new Dependency(SideTreeItem.HotReload, 'Hot reload', isHotReloadEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isHotReloadEnabled ? 'pass::charts.green' : 'circle-large-outline::charts.red'),
				new Dependency(SideTreeItem.HotRebuild, 'Hot rebuild', isHotRebuildEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isHotRebuildEnabled ? 'pass::charts.green' : 'circle-large-outline::charts.red')
			]
		} else if (element.id == SideTreeItem.Release) {
			items.push(new Dependency(SideTreeItem.BuildRelease, isBuildingRelease ? 'Building Release' : 'Build Release', '', TreeItemCollapsibleState.None, isBuildingRelease ? 'sync~spin::charts.green' : 'globe::charts.green'))
			items.push(new Dependency(SideTreeItem.DeployToFirebase, isDeployingToFirebase ? 'Deploying to Firebase' : 'Deploy to Firebase', '', TreeItemCollapsibleState.None, isDeployingToFirebase ? 'sync~spin::charts.orange' : 'flame::charts.orange'))
		} else if (element?.id == SideTreeItem.Project) {
			items = [
				new Dependency(SideTreeItem.NewFilePage, 'New Page', '', TreeItemCollapsibleState.None, 'file-add'),
				new Dependency(SideTreeItem.NewFileClass, 'New Class', '', TreeItemCollapsibleState.None, 'file-code'),
				new Dependency(SideTreeItem.NewFileJS, 'New JS', '', TreeItemCollapsibleState.None, 'file-code'),
				new Dependency(SideTreeItem.NewFileSCSS, 'New SCSS', '', TreeItemCollapsibleState.None, 'file-code')
			]
		} else if (element.id == SideTreeItem.Maintenance) {
			items.push(new Dependency(SideTreeItem.ClearBuildCache, isClearingBuildCache ? 'Clearing Build Cache' : isClearedBuildCache ? 'Cleared Build Cache' : 'Clear Build Cache', '', TreeItemCollapsibleState.None, isClearingBuildCache ? 'sync~spin::charts.red' : isClearedBuildCache ? 'check::charts.green' : 'trash::charts.red'))
			items.push(new Dependency(SideTreeItem.RecompileApp, isRecompilingApp ? 'Recompiling' : 'Recompile', 'App', TreeItemCollapsibleState.None, isRecompilingApp ? 'sync~spin' : 'repl'))
			if (containsService)
				items.push(new Dependency(SideTreeItem.RecompileService, isRecompilingService ? 'Recompiling' : 'Recompile', 'Service', TreeItemCollapsibleState.None, isRecompilingService ? 'sync~spin' : 'server~spin'))
			if (containsJS)
				items.push(new Dependency(SideTreeItem.RecompileJS, isRecompilingJS ? 'Recompiling' : 'Recompile', 'JS', TreeItemCollapsibleState.None, isRecompilingJS ? 'sync~spin' : 'code'))
			if (containsSCSS)
				items.push(new Dependency(SideTreeItem.RecompileCSS, isRecompilingSCSS ? 'Recompiling' : 'Recompile', 'SCSS', TreeItemCollapsibleState.None, isRecompilingSCSS ? 'sync~spin' : 'symbol-color'))
		} else if (element.id == SideTreeItem.Settings) {
			items.push(new Dependency(SideTreeItem.Toolchain, 'Toolchain', `${currentToolchain.replace('swift-wasm-', '')} ${pendingNewToolchain && pendingNewToolchain != currentToolchain ? `(${pendingNewToolchain.replace('swift-wasm-', '')} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'versions'))
			items.push(new Dependency(SideTreeItem.DevPort, 'Port (debug)', `${currentDevPort} ${pendingNewDevPort && pendingNewDevPort != currentDevPort ? `(${pendingNewDevPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower'))
			items.push(new Dependency(SideTreeItem.ProdPort, 'Port (release)', `${currentProdPort} ${pendingNewProdPort && pendingNewProdPort != currentProdPort ? `(${pendingNewProdPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower'))
			items.push(new Dependency(SideTreeItem.LoggingLevel, 'Logging Level', `${currentLoggingLevel}`, TreeItemCollapsibleState.None, 'output'))
		} else if (element?.id == SideTreeItem.Recommendations) {
			if (containsUpdateForSwifweb)
				items.push(new Dependency(SideTreeItem.UpdateSwifWeb, 'Update SwifWeb to 2.0.0', '', TreeItemCollapsibleState.None, 'cloud-download'))
			if (containsUpdateForJSKit)
				items.push(new Dependency(SideTreeItem.UpdateJSKit, 'Update JSKit to 0.20.0', '', TreeItemCollapsibleState.None, 'cloud-download'))
			if (items.length == 0)
				items.push(new Dependency(SideTreeItem.UpdateJSKit, 'No recommendations for now', '', TreeItemCollapsibleState.None, 'check::charts.green', false))
		} else if (element?.id == SideTreeItem.Support) {
			items = [
				new Dependency(SideTreeItem.Documentation, 'Documentation', '', TreeItemCollapsibleState.None, 'book::charts.green'),
				new Dependency(SideTreeItem.Repository, 'Repository', '', TreeItemCollapsibleState.None, 'github-inverted'),
				new Dependency(SideTreeItem.Discussions, 'Discussions', '', TreeItemCollapsibleState.None, 'comment-discussion::charts.purple'),
				new Dependency(SideTreeItem.SubmitAnIssue, 'Submit an issue', '', TreeItemCollapsibleState.None, 'pencil::charts.orange')
			]
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
	Debug = 'Debug',
		ReopenInContainer = 'ReopenInContainer',
		Build = 'Build',
		DebugInChrome = 'DebugInChrome',
		HotReload = 'HotReload',
		HotRebuild = 'HotRebuild',
	Release = 'Release',
		BuildRelease = 'BuildRelease',
		DeployToFirebase = 'DeployToFirebase',
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
	Settings = 'Settings',
		Toolchain = 'Toolchain',
		DevPort = 'DevPort',
		ProdPort = 'ProdPort',
		LoggingLevel = 'LoggingLevel',
	Recommendations = 'Recommendations',
		UpdateSwifWeb = 'UpdateSwifWeb',
		UpdateJSKit = 'UpdateJSKit',
	Support = 'Support',
		Documentation = 'Documentation',
		Repository = 'Repository',
		Discussions = 'Discussions',
		SubmitAnIssue = 'SubmitAnIssue'
}