import { TreeDataProvider, Event, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, Command, Uri } from "vscode"
import { currentLoggingLevel, currentPort, currentProjectLabel, currentToolchain, isBuilding, isBuildingRelease, isClearingBuildCache, isDebugging, isDeployingToFirebase, isHotRebuildEnabled, isHotReloadEnabled, isRecompilingApp, isRecompilingSCSS, isRecompilingJS, isRecompilingService, Webber } from "./webber"
import { env } from "process"
import { isInContainer } from "./extension"

export class SidebarTreeView implements TreeDataProvider<Dependency> {
	private _onDidChangeTreeData: EventEmitter<Dependency | undefined | void> = new EventEmitter<Dependency | undefined | void>()
	readonly onDidChangeTreeData: Event<Dependency | undefined | void> = this._onDidChangeTreeData.event

	constructor(private workspaceRoot: string | undefined, private webber: Webber | undefined) {
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
					new Dependency(SideTreeItem.Project, 'Project', `${currentProjectLabel}`, TreeItemCollapsibleState.Expanded, 'terminal-bash', false)
				]
			} else if (element?.label == SideTreeItem.Project) {
				items = [
					new Dependency(SideTreeItem.ReopenInContainer, 'Reopen in Container', '', TreeItemCollapsibleState.None, 'folder::charts.green')
				]
			}
			return items
		}
		if (element == null) {
			items = [
				new Dependency(SideTreeItem.Project, 'Project', `${currentProjectLabel}`, TreeItemCollapsibleState.Expanded, 'terminal-bash', false),
				new Dependency(SideTreeItem.Deploy, 'Deploy', '', TreeItemCollapsibleState.Expanded, 'cloud-upload', false),
				new Dependency(SideTreeItem.Maintenance, 'Maintenance', '', TreeItemCollapsibleState.Collapsed, 'tools', false),
				new Dependency(SideTreeItem.Settings, 'Settings', '', TreeItemCollapsibleState.Expanded, 'debug-configure', false),
				new Dependency(SideTreeItem.Recommendations, 'Recommendations', '', TreeItemCollapsibleState.Collapsed, 'lightbulb', false),
				new Dependency(SideTreeItem.Support, 'Support', '', TreeItemCollapsibleState.Expanded, 'heart', false)
			]
		} else if (element?.id == SideTreeItem.Project) {
			items = [
				new Dependency(SideTreeItem.Build, isBuilding ? 'Building' : 'Build', '', TreeItemCollapsibleState.None, isBuilding ? 'sync~spin::charts.green' : 'run::charts.green'),
				new Dependency(SideTreeItem.DebugInChrome, isDebugging ? 'Debugging in Chrome' : 'Debug in Chrome', '', TreeItemCollapsibleState.None, isDebugging ? 'sync~spin::charts.blue' : 'debug-alt::charts.blue'),
				new Dependency(SideTreeItem.HotReload, 'Hot reload', isHotReloadEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isHotReloadEnabled ? 'pass::charts.green' : 'circle-large-outline::charts.red'),
				new Dependency(SideTreeItem.HotRebuild, 'Hot rebuild', isHotRebuildEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isHotRebuildEnabled ? 'pass::charts.green' : 'circle-large-outline::charts.red'),
				new Dependency(SideTreeItem.NewFile, 'New', '', TreeItemCollapsibleState.Collapsed, 'gist', false)
			]
		} else if (element?.id == SideTreeItem.NewFile) {
			items = [
				new Dependency(SideTreeItem.NewFilePage, 'Page', '', TreeItemCollapsibleState.None, 'file-add'),
				new Dependency(SideTreeItem.NewFileClass, 'Class', '', TreeItemCollapsibleState.None, 'file-code'),
				new Dependency(SideTreeItem.NewFileJS, 'JS', '', TreeItemCollapsibleState.None, 'file-code'),
				new Dependency(SideTreeItem.NewFileSCSS, 'SCSS', '', TreeItemCollapsibleState.None, 'file-code')
			]
		} else if (element.id == SideTreeItem.Deploy) {
			items = [
				new Dependency(SideTreeItem.BuildRelease, isBuildingRelease ? 'Building Release' : 'Build Release', '', TreeItemCollapsibleState.None, isBuildingRelease ? 'sync~spin::charts.green' : 'globe::charts.green'),
				new Dependency(SideTreeItem.DeployToFirebase, isDeployingToFirebase ? 'Deploying to Firebase' : 'Deploy to Firebase', '', TreeItemCollapsibleState.None, isDeployingToFirebase ? 'sync~spin::charts.orange' : 'flame::charts.orange')
			]
		} else if (element.id == SideTreeItem.Maintenance) {
			items = [
				new Dependency(SideTreeItem.ClearBuildCache, isClearingBuildCache ? 'Clearing Build Cache' : 'Clear Build Cache', '', TreeItemCollapsibleState.None, isClearingBuildCache ? 'sync~spin::charts.red' : 'trash::charts.red'),
				new Dependency(SideTreeItem.RecompileApp, isRecompilingApp ? 'Recompiling' : 'Recompile', 'App', TreeItemCollapsibleState.None, isRecompilingApp ? 'sync~spin' : 'repl'),
				new Dependency(SideTreeItem.RecompileService, isRecompilingService ? 'Recompiling' : 'Recompile', 'Service', TreeItemCollapsibleState.None, isRecompilingService ? 'sync~spin' : 'server~spin'),
				new Dependency(SideTreeItem.RecompileJS, isRecompilingJS ? 'Recompiling' : 'Recompile', 'JS', TreeItemCollapsibleState.None, isRecompilingJS ? 'sync~spin' : 'code'),
				new Dependency(SideTreeItem.RecompileCSS, isRecompilingSCSS ? 'Recompiling' : 'Recompile', 'CSS', TreeItemCollapsibleState.None, isRecompilingSCSS ? 'sync~spin' : 'symbol-color')
			]
		} else if (element.id == SideTreeItem.Settings) {
			items = [
				new Dependency(SideTreeItem.Toolchain, 'Toolchain', `${currentToolchain}`, TreeItemCollapsibleState.None, 'versions'),
				new Dependency(SideTreeItem.Port, 'Port', `${currentPort}`, TreeItemCollapsibleState.None, 'radio-tower'),
				new Dependency(SideTreeItem.LoggingLevel, 'Logging Level', `${currentLoggingLevel}`, TreeItemCollapsibleState.None, 'output')
			]
		} else if (element?.id == SideTreeItem.Recommendations) {
			items = [
				new Dependency(SideTreeItem.UpdateSwifWeb, 'Update SwifWeb to 2.0.0', '', TreeItemCollapsibleState.None, 'cloud-download'),
				new Dependency(SideTreeItem.UpdateJSKit, 'Update JSKit to 0.20.0', '', TreeItemCollapsibleState.None, 'cloud-download'),
			]
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

	contextValue = 'dependency'
}

export enum SideTreeItem {
	Project = 'Project',
		ReopenInContainer = 'ReopenInContainer',
		Build = 'Build',
		DebugInChrome = 'DebugInChrome',
		HotReload = 'HotReload',
		HotRebuild = 'HotRebuild',
		NewFile = 'NewFile',
			NewFilePage = 'NewFilePage',
			NewFileClass = 'NewFileClass',
			NewFileJS = 'NewFileJS',
			NewFileSCSS = 'NewFileCSS',
	Deploy = 'Deploy',
		BuildRelease = 'BuildRelease',
		DeployToFirebase = 'DeployToFirebase',
	Maintenance = 'Maintenance',
		ClearBuildCache = 'ClearBuildCache',
		RecompileApp = 'RecompileApp',
		RecompileService = 'RecompileService',
		RecompileJS = 'RecompileJS',
		RecompileCSS = 'RecompileCSS',
	Settings = 'Settings',
		Toolchain = 'Toolchain',
		Port = 'Port',
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