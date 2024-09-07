import { TreeDataProvider, Event, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, Command, Uri } from "vscode"
import { Webber } from "./webber"

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
		if (element == null) {
			items = [
				new Dependency(RootItem.Project, '', TreeItemCollapsibleState.Expanded, new ThemeIcon('terminal-bash')),
				new Dependency(RootItem.Deploy, '', TreeItemCollapsibleState.Expanded, new ThemeIcon('cloud-upload')),
				new Dependency(RootItem.Maintenance, '', TreeItemCollapsibleState.Expanded, new ThemeIcon('tools')),
				new Dependency(RootItem.Settings, '', TreeItemCollapsibleState.Expanded, new ThemeIcon('debug-configure')),
				new Dependency(RootItem.Recommendations, '', TreeItemCollapsibleState.Collapsed, new ThemeIcon('lightbulb')),
				new Dependency(RootItem.Support, '', TreeItemCollapsibleState.Expanded, new ThemeIcon('question')) // feedback
			]
		} else if (element?.label == RootItem.Project) {
			items = [
				new Dependency('Build', '', TreeItemCollapsibleState.None, new ThemeIcon('run', new ThemeColor('charts.green'))),
				new Dependency('Debug in Chrome', '', TreeItemCollapsibleState.None, new ThemeIcon('debug-alt', new ThemeColor('charts.blue'))),
				new Dependency('Hot reload', '', TreeItemCollapsibleState.None, new ThemeIcon('pass', new ThemeColor('charts.green'))), // circle-large-outline
				new Dependency('Hot rebuild', '', TreeItemCollapsibleState.None, new ThemeIcon('pass', new ThemeColor('charts.green'))), // circle-large-outline
				new Dependency('New', '', TreeItemCollapsibleState.Collapsed, new ThemeIcon('gist'))
			]
		} else if (element?.label == "New") {
			items = [
				new Dependency('Page', '', TreeItemCollapsibleState.None, new ThemeIcon('file-add')),
				new Dependency('Class', '', TreeItemCollapsibleState.None, new ThemeIcon('file-code')),
				new Dependency('JS', '', TreeItemCollapsibleState.None, new ThemeIcon('file-code')),
				new Dependency('CSS', '', TreeItemCollapsibleState.None, new ThemeIcon('file-code'))
			]
		// 	if (this.workspaceRoot) {
		// 		items = [
		// 			new Dependency(
		// 				isProjectGenerating ? "Generating" : isProjectGenerated ? "Regenerate" : "Generate",
		// 				"",
		// 				TreeItemCollapsibleState.None,
		// 				new ThemeIcon(isProjectGenerating ? 'sync~spin' : 'debug-restart', 
		// 				new ThemeColor('charts.blue')), 
		// 				new DepCommand('Generate project', 'generateProject')
		// 			),
		// 			new Dependency(
		// 				isBuildingApp ? "Building" : "Build",
		// 				"",
		// 				TreeItemCollapsibleState.None,
		// 				new ThemeIcon(isBuildingApp ? 'sync~spin' : 'terminal-bash',
		// 				new ThemeColor('charts.orange')),
		// 				isBuildingApp ? undefined : new DepCommand('Build app', 'buildApp')
		// 			),
		// 			new Dependency("Install", `${(await droidy?.adb.devicesList())?.length ?? -1}`, TreeItemCollapsibleState.None, new ThemeIcon('remote', new ThemeColor('charts.yellow')), new DepCommand('Install app', 'installApp')),
		// 			new Dependency("Run", "", TreeItemCollapsibleState.None, new ThemeIcon('run', new ThemeColor('charts.green')), new DepCommand('Run app', 'runApp'))
		// 		]
		// 	}
		} else if (element.label == RootItem.Deploy) {
			items = [
				new Dependency('Build release', '', TreeItemCollapsibleState.None, new ThemeIcon('globe', new ThemeColor('charts.green'))), // save
				new Dependency('Deploy to Firebase', '', TreeItemCollapsibleState.None, new ThemeIcon('flame', new ThemeColor('charts.orange')))
			]
		} else if (element.label == RootItem.Maintenance) {
			items = [
				new Dependency('Clear Build Cache', '', TreeItemCollapsibleState.None, new ThemeIcon('trash', new ThemeColor('charts.red'))),
				new Dependency('Recompile App', '', TreeItemCollapsibleState.None, new ThemeIcon('repl')),
				new Dependency('Recompile Service', '', TreeItemCollapsibleState.None, new ThemeIcon('server~spin')),
				new Dependency('Recompile JS', '', TreeItemCollapsibleState.None, new ThemeIcon('code')), // symbol-module
				new Dependency('Recompile CSS', '', TreeItemCollapsibleState.None, new ThemeIcon('symbol-color'))
			]
		} else if (element.label == RootItem.Settings) {
			items = [
				new Dependency('Toolchain', '', TreeItemCollapsibleState.None, new ThemeIcon('versions')),
				new Dependency('Port', '', TreeItemCollapsibleState.None, new ThemeIcon('radio-tower')),
				new Dependency('Logging Level', '', TreeItemCollapsibleState.None, new ThemeIcon('output'))
			]
		} else if (element?.label == RootItem.Recommendations) {
			items = [
				new Dependency('Update SwifWeb to 2.0.0', '', TreeItemCollapsibleState.None, new ThemeIcon('refresh')),
				new Dependency('Update JSKit to 0.20.0', '', TreeItemCollapsibleState.None, new ThemeIcon('refresh')),
			]
		} else if (element?.label == RootItem.Support) {
			items = [
				new Dependency('Documentation', '', TreeItemCollapsibleState.None, new ThemeIcon('book')),
				new Dependency('Repository', '', TreeItemCollapsibleState.None, new ThemeIcon('github')),
				new Dependency('Leave Feedback', '', TreeItemCollapsibleState.None, new ThemeIcon('pencil'))
			]
		}
		return Promise.resolve(items)
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
		public readonly label: string,
		private readonly version: string,
		public readonly collapsibleState: TreeItemCollapsibleState,
		public readonly iconPath: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon,
		public readonly command?: Command
	) {
		super(label, collapsibleState)
		this.tooltip = label
		this.description = this.version
		this.iconPath = iconPath
	}

	// iconPath = '$(sync~spin)'
	// iconPath = {
	// 	light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
	// 	dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
	// }

	contextValue = 'dependency'
}

enum RootItem {
	Project = 'Project',
	Deploy = 'Deploy',
	Maintenance = 'Maintenance',
	Settings = 'Settings',
	Recommendations = 'Recommendations',
	Support = 'Support'
}