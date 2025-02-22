import path from 'node:path'
import { env } from 'process'
import { TreeDataProvider, Event, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, Command, Disposable, Uri, workspace, commands } from 'vscode'
import { currentDevPort, isBuildingRelease, isDebugging, isHotRebuildEnabled, isHotReloadEnabled, isRecompilingApp, isRecompilingCSS, isRecompilingJS, isRecompilingService, containsUpdateForWeb as containsUpdateForWeb, containsUpdateForJSKit, containsServiceTarget, pendingNewDevPort, pendingNewProdPort, currentProdPort, isAnyHotBuilding, serviceWorkerTargetName, appTargetName, containsAppTarget, isRecompilingHTML, canRecompileAppTarget, canRecompileServiceTarget, isRunningCrawlServer, currentDevCrawlerPort, pendingNewDevCrawlerPort, isDebugGzipEnabled, isDebugBrotliEnabled } from './streams/web/webStream'
import { isBuilding, isClearingBuildCache, isClearedBuildCache, currentLoggingLevel, currentToolchain, pendingNewToolchain } from './streams/stream'
import { extensionContext, ExtensionStream, extensionStream, isInContainer, currentStream, webStream } from './extension'
import { doesPackageCheckedOut, KnownPackage } from './commands/build/helpers'
import { openDocumentInEditorOnLine } from './helpers/openDocumentInEditor'

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
					// new Dependency(SideTreeItem.NewProject, 'New Project', '', TreeItemCollapsibleState.None, this.fileIcon('new-project'))
				]
			}
			return items
		}
		if (element == null) {
			items.push(new Dependency(SideTreeItem.Debug, 'Debug', `${workspace.name?.split('[Dev')[0] ?? ''}`, TreeItemCollapsibleState.Expanded, 'coffee', false))
			items.push(new Dependency(SideTreeItem.Release, 'Release', '', TreeItemCollapsibleState.Collapsed, 'cloud-upload', false))
			// items.push(new Dependency(SideTreeItem.Project, 'Project', '', TreeItemCollapsibleState.Collapsed, 'package', false))
			items.push(new Dependency(SideTreeItem.Maintenance, 'Maintenance', '', TreeItemCollapsibleState.Collapsed, 'tools', false))
			items.push(new Dependency(SideTreeItem.Settings, 'Settings', '', TreeItemCollapsibleState.Expanded, 'debug-configure', false))
			// items.push(new Dependency(SideTreeItem.Recommendations, 'Recommendations', '', TreeItemCollapsibleState.Collapsed, 'lightbulb', false))
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
				new Dependency(SideTreeItem.HotReload, 'Hot reload', isHotReloadEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isHotReloadEnabled ? 'pass::charts.green' : 'circle-large-outline'),
				new Dependency(SideTreeItem.DebugGzip, 'Gzip', isDebugGzipEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isDebugGzipEnabled ? 'pass::charts.green' : 'circle-large-outline'),
				new Dependency(SideTreeItem.DebugBrotli, 'Brotli', isDebugBrotliEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isDebugBrotliEnabled ? 'pass::charts.green' : 'circle-large-outline')
			]
		} else if (element.id == SideTreeItem.Release) {
			items.push(new Dependency(SideTreeItem.BuildRelease, isBuildingRelease ? 'Building Release' : 'Build Release', '', TreeItemCollapsibleState.None, isBuildingRelease ? 'sync~spin::charts.green' : 'globe::charts.green'))
			if (webStream?.firebase.isInstalled === true)
				items.push(new Dependency(SideTreeItem.Firebase, 'Firebase', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('firebase3')))
			if (webStream?.azure.isInstalled === true)
				items.push(new Dependency(SideTreeItem.Azure, 'Azure', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('azure3')))
			if (webStream?.alibaba.isInstalled === true)
				items.push(new Dependency(SideTreeItem.Alibaba, 'Alibaba Cloud', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('alibabacloud3')))
			if (webStream?.vercel.isInstalled === true)
				items.push(new Dependency(SideTreeItem.Vercel, 'Vercel', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('vercel-dark3', 'vercel-light3')))
			if (webStream?.flyio.isInstalled === true)
				items.push(new Dependency(SideTreeItem.FlyIO, 'Fly.io', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('flyio3')))
			if (webStream?.cloudflare.isInstalled === true)
				items.push(new Dependency(SideTreeItem.Cloudflare, 'Cloudflare', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('cloudflare3')))
			if (webStream?.digitalocean.isInstalled === true)
				items.push(new Dependency(SideTreeItem.DigitalOcean, 'DigitalOcean', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('digitalocean3')))
			if (webStream?.heroku.isInstalled === true)
				items.push(new Dependency(SideTreeItem.Heroku, 'Heroku', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('heroku3')))
			if (webStream?.yandex.isInstalled === true)
				items.push(new Dependency(SideTreeItem.YandexCloud, 'Yandex Cloud', '', TreeItemCollapsibleState.Collapsed, this.fileIcon('yandexcloud3')))
			var inactiveProviders: boolean[] = [
				webStream?.alibaba.isInstalled === false,
				webStream?.azure.isInstalled === false,
				webStream?.cloudflare.isInstalled === false,
				webStream?.digitalocean.isInstalled === false,
				webStream?.heroku.isInstalled === false,
				webStream?.vercel.isInstalled === false,
				webStream?.yandex.isInstalled === false
			]
			var activeProviders: boolean[] = [
				webStream?.firebase.isInstalled === false,
				webStream?.flyio.isInstalled === false
			]
			if (activeProviders.includes(true)) {
				items.push(new Dependency(SideTreeItem.AddCloudProvider, 'Add Cloud Provider', '', TreeItemCollapsibleState.Collapsed, 'cloud'))
			}
		} else if (element.id == SideTreeItem.Firebase) {
			if (await webStream?.firebase.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.FirebaseSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else if (webStream) {
				items.push(new Dependency(SideTreeItem.FirebaseDeploy, webStream.firebase.isLoggingIn ? 'Logging in' : webStream.firebase.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webStream.firebase.isLoggingIn || webStream.firebase.isDeploying ? 'sync~spin' : 'cloud-upload'))
				const fullDeployMode = webStream?.firebase.getFullDeployMode()
				if (fullDeployMode != undefined) {
					items.push(new Dependency(SideTreeItem.FirebaseDeployMode, 'Deploy Mode', fullDeployMode ? 'Full' : 'Hosting Only', TreeItemCollapsibleState.None, 'settings'))
				}
			}
			items.push(new Dependency(SideTreeItem.FirebaseDeintegrate, webStream?.firebase.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webStream?.firebase.isDeintegrating ? 'sync~spin' : 'trash'))
		} else if (element.id == SideTreeItem.Azure) {
			if (await webStream?.azure.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.AzureSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else if (webStream) {
				items.push(new Dependency(SideTreeItem.AzureDeploy, webStream.azure.isLoggingIn ? 'Logging in' : webStream.azure.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webStream.azure.isLoggingIn || webStream.azure.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.AzureDeintegrate, webStream?.azure.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webStream?.azure.isDeintegrating ? 'sync~spin' : 'trash'))
		} else if (element.id == SideTreeItem.Alibaba) {
			if (await webStream?.alibaba.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.AlibabaSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else if (webStream) {
				items.push(new Dependency(SideTreeItem.AlibabaDeploy, webStream.alibaba.isLoggingIn ? 'Logging in' : webStream.alibaba.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webStream.alibaba.isLoggingIn || webStream.alibaba.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.AlibabaDeintegrate, webStream?.alibaba.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webStream?.alibaba.isDeintegrating ? 'sync~spin' : 'trash'))
		} else if (element.id == SideTreeItem.Vercel) {
			if (await webStream?.vercel.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.VercelSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else if (webStream) {
				items.push(new Dependency(SideTreeItem.VercelDeploy, webStream.vercel.isLoggingIn ? 'Logging in' : webStream.vercel.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webStream.vercel.isLoggingIn || webStream.vercel.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.VercelDeintegrate, webStream?.vercel.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webStream?.vercel.isDeintegrating ? 'sync~spin' : 'trash'))
		} else if (element.id == SideTreeItem.FlyIO) {
			if (await webStream?.flyio.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.FlyIOSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else if (webStream) {
				items.push(new Dependency(SideTreeItem.FlyIODeploy, webStream.flyio.isLoggingIn ? 'Logging in' : webStream.flyio.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webStream.flyio.isLoggingIn || webStream.flyio.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.FlyIODeintegrate, webStream?.flyio.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webStream?.flyio.isDeintegrating ? 'sync~spin' : 'trash'))
		} else if (element.id == SideTreeItem.Cloudflare) {
			if (await webStream?.cloudflare.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.CloudflareSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else if (webStream) {
				items.push(new Dependency(SideTreeItem.CloudflareDeploy, webStream.cloudflare.isLoggingIn ? 'Logging in' : webStream.cloudflare.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webStream.cloudflare.isLoggingIn || webStream.cloudflare.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.CloudflareDeintegrate, webStream?.cloudflare.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webStream?.cloudflare.isDeintegrating ? 'sync~spin' : 'trash'))
		} else if (element.id == SideTreeItem.DigitalOcean) {
			if (await webStream?.digitalocean.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.DigitalOceanSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else if (webStream) {
				items.push(new Dependency(SideTreeItem.DigitalOceanDeploy, webStream.digitalocean.isLoggingIn ? 'Logging in' : webStream.digitalocean.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webStream.digitalocean.isLoggingIn || webStream.digitalocean.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.DigitalOceanDeintegrate, webStream?.digitalocean.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webStream?.digitalocean.isDeintegrating ? 'sync~spin' : 'trash'))
		} else if (element.id == SideTreeItem.Heroku) {
			if (await webStream?.heroku.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.HerokuSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else if (webStream) {
				items.push(new Dependency(SideTreeItem.HerokuDeploy, webStream.heroku.isLoggingIn ? 'Logging in' : webStream.heroku.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webStream.heroku.isLoggingIn || webStream.heroku.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.HerokuDeintegrate, webStream?.heroku.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webStream?.heroku.isDeintegrating ? 'sync~spin' : 'trash'))
		} else if (element.id == SideTreeItem.YandexCloud) {
			if (await webStream?.yandex.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.YandexCloudSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else if (webStream) {
				items.push(new Dependency(SideTreeItem.YandexCloudDeploy, webStream.yandex.isLoggingIn ? 'Logging in' : webStream.yandex.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, webStream.yandex.isLoggingIn || webStream.yandex.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.YandexCloudDeintegrate, webStream?.yandex.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, webStream?.yandex.isDeintegrating ? 'sync~spin' : 'trash'))
		} else if (element.id == SideTreeItem.AddCloudProvider) {
			if (webStream?.firebase.isInstalled === false)
				items.push(new Dependency(SideTreeItem.AddFirebase, 'Firebase', webStream?.firebase.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, this.fileIcon('firebase3')))
			// if (webStream?.azure.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddAzure, 'Azure', webStream?.azure.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, this.fileIcon('azure3')))
			// if (webStream?.alibaba.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddAlibaba, 'Alibaba Cloud', webStream?.alibaba.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, this.fileIcon('alibabacloud3')))
			// if (webStream?.vercel.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddVercel, 'Vercel', webStream?.vercel.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, this.fileIcon('vercel-dark3', 'vercel-light3')))
			if (webStream?.flyio.isInstalled === false)
				items.push(new Dependency(SideTreeItem.AddFlyIO, 'Fly.io', webStream?.flyio.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, this.fileIcon('flyio3')))
			// if (webStream?.cloudflare.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddCloudflare, 'Cloudflare', webStream?.cloudflare.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, this.fileIcon('cloudflare3')))
			// if (webStream?.digitalocean.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddDigitalOcean, 'DigitalOcean', webStream?.digitalocean.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, this.fileIcon('digitalocean3')))
			// if (webStream?.heroku.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddHeroku, 'Heroku', webStream?.heroku.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, this.fileIcon('heroku3')))
			// if (webStream?.yandex.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddYandexCloud, 'Yandex Cloud', webStream?.yandex.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, this.fileIcon('yandexcloud3')))
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
			items.push(new Dependency(SideTreeItem.DevCrawlerPort, 'Port (crawler)', `${currentDevCrawlerPort} ${pendingNewDevCrawlerPort && pendingNewDevCrawlerPort != currentDevCrawlerPort ? `(${pendingNewDevCrawlerPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower'))
			items.push(new Dependency(SideTreeItem.LoggingLevel, 'Logging Level', `${currentLoggingLevel}`, TreeItemCollapsibleState.None, 'output'))
		} else if (element?.id == SideTreeItem.Recommendations) {
			if (containsUpdateForWeb)
				items.push(new Dependency(SideTreeItem.UpdateWeb, 'Update Web to 2.0.0', '', TreeItemCollapsibleState.None, 'cloud-download'))
			if (containsUpdateForJSKit)
				items.push(new Dependency(SideTreeItem.UpdateJSKit, 'Update JSKit to 0.20.0', '', TreeItemCollapsibleState.None, 'cloud-download'))
			if (items.length == 0)
				items.push(new Dependency(SideTreeItem.UpdateJSKit, 'No recommendations for now', '', TreeItemCollapsibleState.None, 'check::charts.green', false))
		} else if (element?.id == SideTreeItem.Support) {
			if (extensionStream == ExtensionStream.Web) {
				items.push(new Dependency(SideTreeItem.WebDocumentation, 'Documentation', '', TreeItemCollapsibleState.None, 'book::charts.green'))
			} else if (extensionStream == ExtensionStream.Android) {
				items.push(new Dependency(SideTreeItem.AndroidDocumentation, 'Documentation', '', TreeItemCollapsibleState.None, 'book::charts.green'))
			} else if (extensionStream == ExtensionStream.Server) {
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
		WebDocumentation = 'WebDocumentation',
		AndroidDocumentation = 'AndroidDocumentation',
		VaporDocumentation = 'VaporDocumentation',
		HummingbirdDocumentation = 'HummingbirdDocumentation',
		ServerDocumentation = 'ServerDocumentation',
		Repository = 'Repository',
		Discussions = 'Discussions',
		SubmitAnIssue = 'SubmitAnIssue'
}