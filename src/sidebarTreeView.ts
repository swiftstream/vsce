import path from 'node:path'
import { env } from 'process'
import { TreeDataProvider, Event, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, Command, Disposable, Uri, workspace, commands } from 'vscode'
import { isBuildingDebug, isBuildingRelease, isHotRebuildEnabled, isClearingBuildCache, isClearedBuildCache, currentLoggingLevel } from './streams/stream'
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

	private fillNewErrors(): Dependency | undefined {
		for (let i = 0; i < this.errorCommands.length; i++) {
			this.errorCommands[i].dispose()
		}
		this.errorCommands = []
		if (this.errors.length > 0) {
			const eCount = this.errors.map((x) => x.errors.filter((f) => f.type == 'error')?.length ?? 0).reduce((s, a) => s + a, 0)
			const wCount = this.errors.map((x) => x.errors.filter((f) => f.type == 'warning')?.length ?? 0).reduce((s, a) => s + a, 0)
			const nCount = this.errors.map((x) => x.errors.filter((f) => f.type == 'note')?.length ?? 0).reduce((s, a) => s + a, 0)
			return new Dependency(SideTreeItem.Errors, eCount > 0 ? 'Errors' : wCount > 0 ? 'Warnings' : 'Notes', `${eCount + wCount + nCount}`, TreeItemCollapsibleState.Expanded, `bracket-error::charts.${eCount > 0 ? 'red' : wCount > 0 ? 'orange' : 'white'}`, false)
		}
		return undefined
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
					// new Dependency(SideTreeItem.NewProject, 'New Project', '', TreeItemCollapsibleState.None, this.fileIcon('new-project'))
				]
			}
			return items
		}
		if (element == null) {
			if (currentStream) {
				items.push(new Dependency(SideTreeItem.Debug, 'Debug', `${workspace.name?.split('[Dev')[0] ?? ''}`, TreeItemCollapsibleState.Expanded, 'coffee', false))
				items.push(new Dependency(SideTreeItem.Release, 'Release', '', TreeItemCollapsibleState.Collapsed, 'cloud-upload', false))
				const projectItems = await currentStream!.projectItems()
				if (projectItems.length > 0) {
					items.push(new Dependency(SideTreeItem.Project, 'Project', '', TreeItemCollapsibleState.Collapsed, 'package', false))
				}
				items.push(new Dependency(SideTreeItem.Maintenance, 'Maintenance', '', TreeItemCollapsibleState.Collapsed, 'tools', false))
				items.push(new Dependency(SideTreeItem.Settings, 'Settings', '', TreeItemCollapsibleState.Expanded, 'debug-configure', false))
				if (await currentStream?.isThereAnyRecommendation() == true) {
					items.push(new Dependency(SideTreeItem.Recommendations, 'Recommendations', '', TreeItemCollapsibleState.Collapsed, 'lightbulb', false))
				}
				items.push(new Dependency(SideTreeItem.Support, 'Support', '', TreeItemCollapsibleState.Collapsed, 'heart', false))
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
		} else if (element?.id) {
			if (currentStream) {
				switch (element.id) {
				case SideTreeItem.Debug:
					// Actions
					items.push(new Dependency(SideTreeItem.Build, isBuilding || currentStream.isAnyHotBuilding() ? currentStream.isAnyHotBuilding() ? 'Hot Rebuilding' : 'Building' : 'Build', '', TreeItemCollapsibleState.None, isBuilding || currentStream.isAnyHotBuilding() ? currentStream.isAnyHotBuilding() ? 'sync~spin::charts.orange' : 'sync~spin::charts.green' : this.fileIcon('hammer')))
					if (currentStream) items.push(...(await currentStream.debugActionItems()))
					// Options
					items.push(new Dependency(SideTreeItem.HotRebuild, 'Hot rebuild', isHotRebuildEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isHotRebuildEnabled ? 'pass::charts.green' : 'circle-large-outline'))
					if (currentStream) items.push(...(await currentStream.debugOptionItems()))
					break
				case SideTreeItem.Release:
					items.push(new Dependency(SideTreeItem.BuildRelease, isBuildingRelease ? 'Building Release' : 'Build Release', '', TreeItemCollapsibleState.None, isBuildingRelease ? 'sync~spin::charts.green' : 'globe::charts.green'))
					if (currentStream) items.push(...(await currentStream.releaseItems()))
					break
				case SideTreeItem.Project:
					if (currentStream) items.push(...(await currentStream.projectItems()))
					break
				case SideTreeItem.Maintenance:
					items.push(new Dependency(SideTreeItem.ClearBuildCache, isClearingBuildCache ? 'Clearing Build Cache' : isClearedBuildCache ? 'Cleared Build Cache' : 'Clear Build Cache', '', TreeItemCollapsibleState.None, isClearingBuildCache ? 'sync~spin::charts.red' : isClearedBuildCache ? 'check::charts.green' : 'trash::charts.red'))
					if (currentStream) items.push(...(await currentStream.maintenanceItems()))
					break
				case SideTreeItem.Settings:
					items.push(new Dependency(SideTreeItem.Toolchain, 'Toolchain', `${currentToolchain.replace('swift-wasm-', '')} ${pendingNewToolchain && pendingNewToolchain != currentToolchain ? `(${pendingNewToolchain.replace('swift-wasm-', '')} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'versions'))
					if (currentStream) items.push(...(await currentStream.settingsItems()))
					items.push(new Dependency(SideTreeItem.LoggingLevel, 'Logging Level', `${currentLoggingLevel}`, TreeItemCollapsibleState.None, 'output'))
					break
				case SideTreeItem.Recommendations:
					if (currentStream) items.push(...(await currentStream.recommendationsItems()))
					break
				case SideTreeItem.Support:
					items.push(new Dependency(SideTreeItem.Documentation, 'Documentation', '', TreeItemCollapsibleState.None, 'book::charts.green'))
					if (![ExtensionStream.Pure, ExtensionStream.Unknown].includes(extensionStream)) {
						items.push(new Dependency(SideTreeItem.Repository, 'Repository', '', TreeItemCollapsibleState.None, 'github-inverted'))
						items.push(new Dependency(SideTreeItem.Discussions, 'Discussions', '', TreeItemCollapsibleState.None, 'comment-discussion::charts.purple'))
						items.push(new Dependency(SideTreeItem.SubmitAnIssue, 'Submit an issue', '', TreeItemCollapsibleState.None, 'pencil::charts.orange'))
					}
					items.push(new Dependency(SideTreeItem.OpenDiscord, 'Discord', '', TreeItemCollapsibleState.None, this.fileIcon('discord')))
					if (isCIS()) {
						items.push(new Dependency(SideTreeItem.OpenTelegram, 'Telegram', '', TreeItemCollapsibleState.None, this.fileIcon('telegram')))
					}
					items.push(new Dependency(SideTreeItem.OpenSwiftForums, 'Swift Forums', '', TreeItemCollapsibleState.None, this.fileIcon('swift_forums')))
					break
				default: break
				}
			}
		} else if (currentStream && element) {
			items.push(...(await currentStream.customItems(element)))
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
		BuildDebug = 'BuildDebug',
		DebugInChrome = 'DebugInChrome',
		RunCrawlServer = 'RunCrawlServer',
		HotReload = 'HotReload',
		HotRebuild = 'HotRebuild',
		DebugGzip = 'DebugGzip',
		DebugBrotli = 'DebugBrotli',
	Release = 'Release',
		BuildRelease = 'BuildRelease',
		Firebase = 'Firebase',
			FirebaseSetup = 'FirebaseSetup',
			FirebaseDeployMode = 'FirebaseDeployMode',
			FirebaseDeploy = 'FirebaseDeployHosting',
			FirebaseDeintegrate = 'FirebaseDeintegrate',
		Azure = 'Azure',
			AzureSetup = 'AzureSetup',
			AzureDeployMode = 'AzureDeployMode',
			AzureDeploy = 'AzureDeploy',
			AzureDeintegrate = 'AzureDeintegrate',
		Alibaba = 'Alibaba',
			AlibabaSetup = 'AlibabaSetup',
			AlibabaDeployMode = 'AlibabaDeployMode',
			AlibabaDeploy = 'AlibabaDeploy',
			AlibabaDeintegrate = 'AlibabaDeintegrate',
		Vercel = 'Vercel',
			VercelSetup = 'VercelSetup',
			VercelDeployMode = 'VercelDeployMode',
			VercelDeploy = 'VercelDeploy',
			VercelDeintegrate = 'VercelDeintegrate',
		FlyIO = 'FlyIO',
			FlyIOSetup = 'FlyIOSetup',
			FlyIODeploy = 'FlyIODeploy',
			FlyIODeintegrate = 'FlyIODeintegrate',
		Cloudflare = 'Cloudflare',
			CloudflareSetup = 'CloudflareSetup',
			CloudflareDeployMode = 'CloudflareDeployMode',
			CloudflareDeploy = 'CloudflareDeploy',
			CloudflareDeintegrate = 'CloudflareDeintegrate',
		DigitalOcean = 'DigitalOcean',
			DigitalOceanSetup = 'DigitalOceanSetup',
			DigitalOceanDeployMode = 'DigitalOceanDeployMode',
			DigitalOceanDeploy = 'DigitalOceanDeploy',
			DigitalOceanDeintegrate = 'DigitalOceanDeintegrate',
		Heroku = 'Heroku',
			HerokuSetup = 'HerokuSetup',
			HerokuDeployMode = 'HerokuDeployMode',
			HerokuDeploy = 'HerokuDeploy',
			HerokuDeintegrate = 'HerokuDeintegrate',
		YandexCloud = 'YandexCloud',
			YandexCloudSetup = 'YandexCloudSetup',
			YandexCloudDeployMode = 'YandexCloudDeployMode',
			YandexCloudDeploy = 'YandexCloudDeploy',
			YandexCloudDeintegrate = 'YandexCloudDeintegrate',
		AddCloudProvider = 'AddCloudProvider',
			AddFirebase = 'AddFirebase',
			AddAzure = 'AddAzure',
			AddAlibaba = 'AddAlibaba',
			AddVercel = 'AddVercel',
			AddFlyIO = 'AddFlyIO',
			AddCloudflare = 'AddCloudflare',
			AddDigitalOcean = 'AddDigitalOcean',
			AddHeroku = 'AddHeroku',
			AddYandexCloud = 'AddYandexCloud',
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
		DevCrawlerPort = 'DevCrawlerPort',
		ProdPort = 'ProdPort',
		LoggingLevel = 'LoggingLevel',
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