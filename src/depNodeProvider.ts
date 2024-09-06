import { TreeDataProvider, Event, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, Command, Uri } from "vscode"
import { Webber } from "./webber"

export class DepNodeProvider implements TreeDataProvider<Dependency> {
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
		items = [
			new Dependency("Project", "", TreeItemCollapsibleState.Expanded, new ThemeIcon('default-view-icon')),
			new Dependency("Emulators", "", TreeItemCollapsibleState.Expanded, new ThemeIcon('notebook-kernel-select')),
			new Dependency("Devices", "", TreeItemCollapsibleState.Expanded, new ThemeIcon('device-mobile')),
			new Dependency("Prepare", "", TreeItemCollapsibleState.Expanded, new ThemeIcon('debug-configure'))
		]
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