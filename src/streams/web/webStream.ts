import * as fs from 'fs'
import * as path from 'path'
import { commands, workspace, DebugSession, FileRenameEvent, FileDeleteEvent, ConfigurationChangeEvent, TextDocument, TreeItemCollapsibleState } from 'vscode'
import { Dependency, SideTreeItem } from '../../sidebarTreeView'
import { defaultWebCrawlerPort, defaultWebDevPort, defaultWebProdPort, extensionContext, isInContainer, projectDirectory, sidebarTreeView, ContextKey } from '../../extension'
import { readWebPortsFromDevContainer } from '../../helpers/readPortsFromDevContainer'
import { NPM } from '../../npm'
import { Webpack } from '../../webpack'
import { buildCommand, cachedSwiftTargets, hotRebuildCSS, hotRebuildHTML, hotRebuildJS, hotRebuildSwift } from './commands/build'
import { buildReleaseCommand } from './commands/buildRelease'
import { debugInChromeCommand } from './commands/debugInChrome'
import { hotReloadCommand } from './commands/hotReload'
import { newFilePageCommand, newFileClassCommand, newFileJSCommand, newFileCSSCommand } from '../../commands/newFile'
import { portDevCommand } from './commands/portDev'
import { portProdCommand } from './commands/portProd'
import { updateWebCommand, updateJSKitCommand } from './commands/suggestions'
import { Gzip } from '../../gzip'
import { Wasm } from '../../wasm'
import { CrawlServer } from '../../crawlServer'
import { Firebase } from './features/firebase'
import { Alibaba } from './features/alibaba'
import { Azure } from './features/azure'
import { Cloudflare } from './features/cloudflare'
import { DigitalOcean } from './features/digitalocean'
import { FlyIO } from './features/flyio'
import { Heroku } from './features/heroku'
import { Vercel } from './features/vercel'
import { Yandex } from './features/yandex'
import { Brotli } from '../../brotli'
import { portDevCrawlerCommand } from './commands/portDevCrawler'
import { isHotRebuildEnabled, Stream } from '../stream'
import { debugGzipCommand } from './commands/debugGzip'
import { debugBrotliCommand } from './commands/debugBrotli'
import { startWebSocketServer } from './commands/webSocketServer'
import { AnyFeature } from '../anyFeature'
import { restartLSPCommand } from '../../commands/restartLSP'

export var indexFile = 'main.html'
export var webSourcesFolder = 'WebSources'
export var appTargetName = 'App'
export var serviceWorkerTargetName = 'Service'
export var buildDevFolder = 'DevPublic'
export var buildProdFolder = 'DistPublic'

export var currentDevPort: string = `${defaultWebDevPort}`
export var currentDevCrawlerPort: string = `${defaultWebCrawlerPort}`
export var currentProdPort: string = `${defaultWebProdPort}`
export var pendingNewDevPort: string | undefined
export var pendingNewDevCrawlerPort: string | undefined
export var pendingNewProdPort: string | undefined

export var isDebuggingInChrome = false
export var isHotBuildingCSS = false
export var isHotBuildingJS = false
export var isHotBuildingHTML = false
export var isHotReloadEnabled = false
export var isDebugGzipEnabled = false
export var isDebugBrotliEnabled = false
export var isRunningCrawlServer = false

var isRecompilingApp = false
var isRecompilingService = false
var isRecompilingJS = false
var isRecompilingCSS = false
var isRecompilingHTML = false
var containsUpdateForWeb = false // TODO: check if Web could be updated
var containsUpdateForJSKit = false // TODO: check if JSKit could be updated

export class WebStream extends Stream {
	public npmWeb: NPM
	public npmJSKit: NPM
	public webpack: Webpack
	public wasm: Wasm
	public gzip: Gzip
	public brotli: Brotli
	public crawlServer: CrawlServer

	// Cloud providers
	public alibaba: Alibaba
	public azure: Azure
	public cloudflare: Cloudflare
	public digitalocean: DigitalOcean
	public firebase: Firebase
	public flyio: FlyIO
	public heroku: Heroku
	public vercel: Vercel
	public yandex: Yandex

    constructor(overrideConfigure: boolean = false) {
		super(true)
		this.npmWeb = new NPM(this, `${projectDirectory}/${webSourcesFolder}`)
		this.npmJSKit = new NPM(this, `${projectDirectory}/.build/.wasi/checkouts/JavaScriptKit`)
		this.webpack = new Webpack(this)
		this.wasm = new Wasm(this)
		this.gzip = new Gzip(this)
		this.brotli = new Brotli(this)
		this.crawlServer = new CrawlServer(this)
		this.alibaba = new Alibaba(this)
		this.azure = new Azure(this)
		this.cloudflare = new Cloudflare(this)
		this.digitalocean = new DigitalOcean(this)
		this.firebase = new Firebase(this)
		this.flyio = new FlyIO(this)
		this.heroku = new Heroku(this)
		this.vercel = new Vercel(this)
		this.yandex = new Yandex(this)
		if (!overrideConfigure) this.configure()
	}

	configure() {
		super.configure()
		if (!projectDirectory) return
		const readPorts = readWebPortsFromDevContainer()
		currentDevPort = `${readPorts.devPort ?? defaultWebDevPort}`
		currentProdPort = `${readPorts.prodPort ?? defaultWebProdPort}`
		currentDevCrawlerPort = `${readPorts.devCrawlerPort ?? defaultWebCrawlerPort}`
		this.setHotReload()
		this.setDebugGzip()
		this.setDebugBrotli()
		this.setWebSourcesPath()
		const isBuildButtonEnabled = workspace.getConfiguration().get('swift.showTopBuildButton') as boolean
        this.setContext(ContextKey.isNavigationBuildButtonEnabled, isBuildButtonEnabled ?? true)
        const isRunButtonEnabled = workspace.getConfiguration().get('swift.showTopRunButton') as boolean
        this.setContext(ContextKey.isNavigationRunButtonEnabled, isRunButtonEnabled ?? true)
		this.crawlServer.registerTaskProvider({
			pathToWasm: `${projectDirectory}/${buildDevFolder}/${appTargetName.toLowerCase()}.wasm`,
			debug: true
		})
		startWebSocketServer()
		restartLSPCommand()
	}

	async onDidTerminateDebugSession(session: DebugSession) {
		await super.onDidTerminateDebugSession(session)
		if (session.configuration.type.includes('chrome')) {
			this.setDebuggingInChrome(false)
			sidebarTreeView?.refresh()
		}
	}

	async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
		super.onDidChangeConfiguration(event)
		if (event.affectsConfiguration('web.hotReload'))
			this.setHotReload()
		if (event.affectsConfiguration('web.debugGzip'))
			this.setDebugGzip()
		if (event.affectsConfiguration('web.debugBrotli'))
			this.setDebugBrotli()
		if (event.affectsConfiguration('web.webSourcesPath'))
			this.setWebSourcesPath()
		if (event.affectsConfiguration('web.appTargetName'))
			this.setAppTargetName()
		if (event.affectsConfiguration('web.serviceWorkerTargetName'))
			this.setServiceWorkerTargetName()
	}

	isAnyHotBuilding(): boolean {
		return super.isAnyHotBuilding() || isHotBuildingCSS || isHotBuildingJS || isHotBuildingHTML
	}

	setHotReload(value?: boolean) {
		isHotReloadEnabled = value ?? workspace.getConfiguration().get('web.hotReload') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('web.hotReload', value)
		sidebarTreeView?.refresh()
	}

	setDebugGzip(value?: boolean) {
		isDebugGzipEnabled = value ?? workspace.getConfiguration().get('web.debugGzip') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('web.debugGzip', value)
		sidebarTreeView?.refresh()
	}

	setDebugBrotli(value?: boolean) {
		isDebugBrotliEnabled = value ?? workspace.getConfiguration().get('web.debugBrotli') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('web.debugBrotli', value)
		sidebarTreeView?.refresh()
	}

	setWebSourcesPath(value?: string) {
		const newValue = value ?? workspace.getConfiguration().get('web.webSourcesPath') as string
		if (webSourcesFolder != newValue) {
			const oldPath = `${projectDirectory}/${webSourcesFolder}`
			const newPath = `${projectDirectory}/${newValue}`
			if (fs.existsSync(oldPath) && !fs.existsSync(newPath))
				fs.renameSync(oldPath, newPath)
		}
		webSourcesFolder = newValue
		if (value) workspace.getConfiguration().update('web.webSourcesPath', value)
		sidebarTreeView?.refresh()
	}

	setAppTargetName(value?: string) {
		appTargetName = value ?? workspace.getConfiguration().get('web.appTargetName') as string
		if (value) workspace.getConfiguration().update('web.appTargetName', value)
		sidebarTreeView?.refresh()
	}

	setServiceWorkerTargetName(value?: string) {
		serviceWorkerTargetName = value ?? workspace.getConfiguration().get('web.serviceWorkerTargetName') as string
		if (value) workspace.getConfiguration().update('web.serviceWorkerTargetName', value)
		sidebarTreeView?.refresh()
	}

	setRecompilingService(active: boolean) {
		isRecompilingService = active
	}

	setHotBuildingCSS(active: boolean) {
		isHotBuildingCSS = active
		isRecompilingCSS = active
	}
	
	setHotBuildingJS(active: boolean) {
		isHotBuildingJS = active
		isRecompilingJS = active
	}
	
	setHotBuildingHTML(active: boolean) {
		isHotBuildingHTML = active
		isRecompilingHTML = active
	}
	
	setHotBuildingSwift(active: boolean) {
		super.setHotBuildingSwift(active)
		if (!active) {
			isRecompilingApp = false
			isRecompilingService = false
		}
	}
	
	setDebuggingInChrome(active: boolean) {
		isDebuggingInChrome = active
		this.setContext(ContextKey.isDebugging, active)
	}
	
	setRunningCrawlServer(active: boolean) {
		isRunningCrawlServer = active
	}
	
	setRecompilingApp(active: boolean) {
		isRecompilingApp = active
	}
	
	setPendingNewDevPort(value: string | undefined) {
		if (!isInContainer() && value) {
			currentDevPort = value
			pendingNewDevPort = undefined
		} else {
			pendingNewDevPort = value
		}
		sidebarTreeView?.refresh()
	}

	setPendingNewDevCrawlerPort(value: string | undefined) {
		if (!isInContainer() && value) {
			currentDevCrawlerPort = value
			pendingNewDevCrawlerPort = undefined
		} else {
			pendingNewDevCrawlerPort = value
		}
		sidebarTreeView?.refresh()
	}
	
	setPendingNewProdPort(value: string | undefined) {
		if (!isInContainer() && value) {
			currentProdPort = value
			pendingNewProdPort = undefined
		} else {
			pendingNewProdPort = value
		}
		sidebarTreeView?.refresh()
	}

	registerCommands() {
		super.registerCommands()
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DebugInChrome, debugInChromeCommand))
        extensionContext.subscriptions.push(commands.registerCommand('runDebugAttached', async () => { await debugInChromeCommand() }))
        extensionContext.subscriptions.push(commands.registerCommand('runDebugAttachedTopBar', async () => { await debugInChromeCommand() }))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunCrawlServer, async () => { await this.crawlServer.startStop() }))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HotReload, hotReloadCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DebugGzip, debugGzipCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DebugBrotli, debugBrotliCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFilePage, newFilePageCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileClass, newFileClassCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileJS, newFileJSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileSCSS, newFileCSSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileApp, () => {
			this.hotRebuildSwift({ target: appTargetName })
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileService, () => {
			this.hotRebuildSwift({ target: serviceWorkerTargetName })
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileJS, hotRebuildJS))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileCSS, hotRebuildCSS))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileHTML, hotRebuildHTML))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DevPort, portDevCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ProdPort, portProdCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DevCrawlerPort, portDevCrawlerCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.UpdateWeb, updateWebCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.UpdateJSKit, updateJSKitCommand))
	}
	
	async onDidSaveTextDocument(document: TextDocument): Promise<boolean> {
		if (await super.onDidSaveTextDocument(document)) return true
		if (!isInContainer) return false
		// if (document.isDirty) return
		if (document.uri.scheme === 'file') {
			const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
			// Web sources
			if (document.uri.path.startsWith(`${projectDirectory}/${webSourcesFolder}`) && isHotRebuildEnabled) {
				// CSS
				if (['css', 'scss', 'sass'].includes(document.languageId)) {
					await this.goThroughHashCheck(document, async () => {
						await hotRebuildCSS(this)
					})
					return true
				}
				// JavaScript
				else if (['javascript', 'typescript', 'typescriptreact'].includes(document.languageId) || document.uri.path === `${projectDirectory}/${webSourcesFolder}/tsconfig.json`) {
					await this.goThroughHashCheck(document, async () => {
						await hotRebuildJS(this, { path: document.uri.path })
					})
					return true
				}
				// HTML
				else if (['html'].includes(document.languageId.toLowerCase())) {
					await this.goThroughHashCheck(document, async () => {
						await hotRebuildHTML(this)
					})
					return true
				}
			}
			// VSCode configuration files
			else if (document.languageId === 'jsonc' && document.uri.scheme === 'file') {
				// devcontainer.json
				if (document.uri.path == devContainerPath) {
					const readPorts = await readWebPortsFromDevContainer()
					if (readPorts.devPortPresent && `${readPorts.devPort}` != currentDevPort) {
						this.setPendingNewDevPort(`${readPorts.devPort}`)
					} else {
						this.setPendingNewDevPort(undefined)
					}
					if (readPorts.devCrawlerPortPresent && `${readPorts.devCrawlerPort}` != currentDevCrawlerPort) {
						this.setPendingNewDevCrawlerPort(`${readPorts.devCrawlerPort}`)
					} else {
						this.setPendingNewDevCrawlerPort(undefined)
					}
					if (readPorts.prodPortPresent && `${readPorts.prodPort}` != currentProdPort) {
						this.setPendingNewProdPort(`${readPorts.prodPort}`)
					} else {
						this.setPendingNewProdPort(undefined)
					}
					return true
				}
			}
		}
		return false
	}

	onDidRenameFiles(event: FileRenameEvent) {
		super.onDidRenameFiles(event)
		const webSourcesRename = event.files.filter(x => x.oldUri.path === `${projectDirectory}/${webSourcesFolder}`).pop()
		if (webSourcesRename) {
			const newFolderName = webSourcesRename.newUri.path.replace(`${projectDirectory}/`, '')
			this.setWebSourcesPath(newFolderName)
		}
	}

	onDidDeleteFiles(event: FileDeleteEvent) {
		super.onDidDeleteFiles(event)
		if (event.files.find((f) => f.path == `${projectDirectory}/Firebase`)) {
			sidebarTreeView?.refresh()
		}
	}

	features(): AnyFeature[] {
		return [
			this.firebase,
			// this.azure,
			// this.alibaba,
			// this.vercel,
			this.flyio,
			// this.cloudflare,
			// this.digitalocean,
			// this.heroku,
			// this.yandex
		]
	}
	
	isDebugBuilt(): boolean {
		return fs.existsSync(path.join(projectDirectory!, buildDevFolder))
	}
	
	isReleaseBuilt(): boolean {
		return fs.existsSync(path.join(projectDirectory!, buildProdFolder))
	}

	async buildDebug() {
		await buildCommand(this)
	}

	async hotRebuildSwift(params?: { target?: string }) {
		hotRebuildSwift(this, params)
	}

	async buildRelease(successCallback?: any) {
		await buildReleaseCommand(this, successCallback)
	}

	// MARK: Side Bar Tree View Items

	async debugActionItems(): Promise<Dependency[]> {
		return [
			new Dependency({
				id: SideTreeItem.DebugInChrome,
				label: isDebuggingInChrome ? 'Debugging in Chrome' : 'Debug in Chrome',
				icon: isDebuggingInChrome ? 'sync~spin::charts.blue' : 'debug-alt::charts.blue'
			}),
			new Dependency({
				id: SideTreeItem.RunCrawlServer,
				label: isRunningCrawlServer ? 'Running Crawl Server' : 'Run Crawl Server',
				icon: isRunningCrawlServer ? 'sync~spin' : 'debug-console'
			})
		]
	}

	async debugOptionItems(): Promise<Dependency[]> {
		return [
			new Dependency({
				id: SideTreeItem.HotReload,
				label: 'Hot reload',
				version: isHotReloadEnabled ? 'Enabled' : 'Disabled',
				icon: isHotReloadEnabled ? 'pass::charts.green' : 'circle-large-outline'
			}),
			new Dependency({
				id: SideTreeItem.DebugGzip,
				label: 'Gzip',
				version: isDebugGzipEnabled ? 'Enabled' : 'Disabled',
				icon: isDebugGzipEnabled ? 'pass::charts.green' : 'circle-large-outline'
			}),
			new Dependency({
				id: SideTreeItem.DebugBrotli,
				label: 'Brotli',
				version: isDebugBrotliEnabled ? 'Enabled' : 'Disabled',
				icon: isDebugBrotliEnabled ? 'pass::charts.green' : 'circle-large-outline'
			})
		]
	}

	async releaseItems(): Promise<Dependency[]> { return [] }

	async projectItems(): Promise<Dependency[]> {
		// return [
		// 	new Dependency({
		// 		id: SideTreeItem.NewFilePage,
		// 		label: 'New Page',
		// 		icon: 'file-add'
		// 	}),
		// 	new Dependency({
		// 		id: SideTreeItem.NewFileClass,
		// 		label: 'New Class',
		// 		icon: 'file-code'
		// 	}),
		// 	new Dependency({
		// 		id: SideTreeItem.NewFileJS,
		// 		label: 'New JS',
		// 		icon: 'file-code'
		// 	}),
		// 	new Dependency({
		// 		id: SideTreeItem.NewFileSCSS,
		// 		label: 'New CSS',
		// 		icon: 'file-code'
		// 	})
		// ]
		return []
	}

	async maintenanceItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		if (await this.containsAppTarget() && this.canRecompileAppTarget())
			items.push(new Dependency({
				id: SideTreeItem.RecompileApp,
				label: isRecompilingApp ? 'Recompiling' : 'Recompile',
				version: appTargetName,
				icon: isRecompilingApp ? 'sync~spin' : 'repl'
			}))
		if (await this.containsServiceTarget() && this.canRecompileServiceTarget())
			items.push(new Dependency({
				id: SideTreeItem.RecompileService,
				label: isRecompilingService ? 'Recompiling' : 'Recompile',
				version: serviceWorkerTargetName,
				icon: isRecompilingService ? 'sync~spin' : 'server~spin'
			}))
		items.push(new Dependency({
			id: SideTreeItem.RecompileJS,
			label: isRecompilingJS ? 'Recompiling' : 'Recompile',
			version: 'JS',
			icon: isRecompilingJS ? 'sync~spin' : 'code'
		}))
		items.push(new Dependency({
			id: SideTreeItem.RecompileCSS,
			label: isRecompilingCSS ? 'Recompiling' : 'Recompile',
			version: 'CSS',
			icon: isRecompilingCSS ? 'sync~spin' : 'symbol-color'
		}))
		items.push(new Dependency({
			id: SideTreeItem.RecompileHTML,
			label: isRecompilingHTML ? 'Recompiling' : 'Recompile',
			version: 'HTML',
			icon: isRecompilingHTML ? 'sync~spin' : 'compass'
		}))
		return items
	}

	async settingsItems(): Promise<Dependency[]> {
		return [
			new Dependency({
				id: SideTreeItem.DevPort,
				label: 'Port (debug)',
				version: `${currentDevPort} ${pendingNewDevPort && pendingNewDevPort != currentDevPort ? `(${pendingNewDevPort} pending reload)` : ''}`,
				icon: 'radio-tower'
			}),
			new Dependency({
				id: SideTreeItem.ProdPort,
				label: 'Port (release)',
				version: `${currentProdPort} ${pendingNewProdPort && pendingNewProdPort != currentProdPort ? `(${pendingNewProdPort} pending reload)` : ''}`,
				icon: 'radio-tower'
			}),
			new Dependency({
				id: SideTreeItem.DevCrawlerPort,
				label: 'Port (crawler)',
				version: `${currentDevCrawlerPort} ${pendingNewDevCrawlerPort && pendingNewDevCrawlerPort != currentDevCrawlerPort ? `(${pendingNewDevCrawlerPort} pending reload)` : ''}`,
				icon: 'radio-tower'
			})
		]
	}

	async recommendationsItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		// if (containsUpdateForWeb)
		// 	items.push(new Dependency({
		// 		id: SideTreeItem.UpdateWeb,
		// 		label: 'Update Web to 2.0.0',
		// 		icon: 'cloud-download'
		// 	}))
		// if (containsUpdateForJSKit)
		// 	items.push(new Dependency({
		// 		id: SideTreeItem.UpdateJSKit,
		// 		label: 'Update JSKit to 0.20.0',
		// 		icon: 'cloud-download'
		// 	}))
		// if (items.length == 0)
		// 	items.push(new Dependency({
		// 		id: SideTreeItem.UpdateJSKit,
		// 		label: 'No recommendations for now',
		// 		icon: 'check::charts.green'
		// 	}))
		return items
	}

	async customItems(element: Dependency): Promise<Dependency[]> { return await super.customItems(element) }

	// MARK: Helpers

	async containsAppTarget() {
		const targetsDump = cachedSwiftTargets ?? await this.swift.getWebTargets()
		return targetsDump.executables.includes(appTargetName)
	}
	
	canRecompileAppTarget() {
		return fs.existsSync(`${projectDirectory}/.build/debug/${appTargetName}`)
	}

	async containsServiceTarget() {
		const targetsDump = cachedSwiftTargets ?? await this.swift.getWebTargets()
		return targetsDump.serviceWorkers.includes(serviceWorkerTargetName)
	}

	canRecompileServiceTarget() {
		return fs.existsSync(`${projectDirectory}/.build/debug/${serviceWorkerTargetName}`)
	}
}