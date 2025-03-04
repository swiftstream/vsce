import * as fs from 'fs'
import { commands, workspace, debug, DebugSession, FileRenameEvent, FileDeleteEvent, ConfigurationChangeEvent, TextDocument, TreeItemCollapsibleState } from 'vscode'
import { Dependency, SideTreeItem } from '../../sidebarTreeView'
import { defaultWebCrawlerPort, defaultWebDevPort, defaultWebProdPort, extensionContext, isInContainer, projectDirectory, sidebarTreeView, currentStream } from '../../extension'
import { readPortsFromDevContainer } from '../../helpers/readPortsFromDevContainer'
import { createDebugConfigIfNeeded } from '../../helpers/createDebugConfigIfNeeded'
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
import { Firebase } from '../../clouds/firebase'
import { Alibaba } from '../../clouds/alibaba'
import { Azure } from '../../clouds/azure'
import { Cloudflare } from '../../clouds/cloudflare'
import { DigitalOcean } from '../../clouds/digitalocean'
import { FlyIO } from '../../clouds/flyio'
import { Heroku } from '../../clouds/heroku'
import { Vercel } from '../../clouds/vercel'
import { Yandex } from '../../clouds/yandex'
import { Brotli } from '../../brotli'
import { portDevCrawlerCommand } from './commands/portDevCrawler'
import { isHotRebuildEnabled, LogLevel, print, Stream } from '../stream'
import { generateChecksum } from '../../helpers/filesHelper'
import { debugGzipCommand } from './commands/debugGzip'
import { debugBrotliCommand } from './commands/debugBrotli'
import { startWebSocketServer } from './commands/webSocketServer'

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

export var isHotBuildingCSS = false
export var isHotBuildingJS = false
export var isHotBuildingHTML = false
export var isDebuggingInChrome = false
export var isHotReloadEnabled = false
export var isDebugGzipEnabled = false
export var isDebugBrotliEnabled = false
export var isBuildingRelease = false
export var abortBuildingRelease: (() => void) | undefined
export var isRunningCrawlServer = false

var isRecompilingApp = false
var isRecompilingService = false
var isRecompilingJS = false
var isRecompilingCSS = false
var isRecompilingHTML = false
var containsUpdateForWeb = true // TODO: check if Web could be updated
var containsUpdateForJSKit = true // TODO: check if JSKit could be updated

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

    constructor() {
		super()
		extensionContext.subscriptions.push(debug.onDidTerminateDebugSession(async (e: DebugSession) => {
			if (e.configuration.type.includes('chrome')) {
				this.setDebuggingInChrome(false)
				sidebarTreeView?.refresh()
			}
		}))
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
		this._configureWeb()
	}

	private _configureWeb = async () => {
		if (!projectDirectory) return
		const readPorts = await readPortsFromDevContainer()
		console.dir({ readPorts: readPorts })
		currentDevPort = `${readPorts.devPort ?? defaultWebDevPort}`
		currentProdPort = `${readPorts.prodPort ?? defaultWebProdPort}`
		currentDevCrawlerPort = `${readPorts.devCrawlerPort ?? defaultWebCrawlerPort}`
		createDebugConfigIfNeeded()
		this.setHotReload()
		this.setHotRebuild()
		this.setDebugGzip()
		this.setDebugBrotli()
		this.setWebSourcesPath()
		this.crawlServer.registerTaskProvider({
			pathToWasm: `${projectDirectory}/${buildDevFolder}/${appTargetName.toLowerCase()}.wasm`,
			debug: true
		})
		startWebSocketServer()
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
		commands.executeCommand('setContext', 'isDebuggingInChrome', active)
	}
	
	setAbortBuildingRelease(handler: () => void | undefined) {
		abortBuildingRelease = handler
	}
	
	setBuildingRelease(active: boolean) {
		if (!active) abortBuildingRelease = undefined
		isBuildingRelease = active
		commands.executeCommand('setContext', 'isBuildingRelease', active)
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
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunCrawlServer, async () => { await this.crawlServer.startStop() }))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HotReload, hotReloadCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DebugGzip, debugGzipCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DebugBrotli, debugBrotliCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFilePage, newFilePageCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileClass, newFileClassCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileJS, newFileJSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileSCSS, newFileCSSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileApp, () => {
			hotRebuildSwift(this, { target: appTargetName })
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileService, () => {
			hotRebuildSwift(this, { target: serviceWorkerTargetName })
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileJS, hotRebuildJS))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileCSS, hotRebuildCSS))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileHTML, hotRebuildHTML))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DevPort, portDevCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ProdPort, portProdCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DevCrawlerPort, portDevCrawlerCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.UpdateWeb, updateWebCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.UpdateJSKit, updateJSKitCommand))
		
		// Cloud Providers
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddFirebase, this.firebase.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Firebase, () => {}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FirebaseSetup, this.firebase.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FirebaseDeployMode, this.firebase.changeDeployMode))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FirebaseDeploy, this.firebase.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FirebaseDeintegrate, this.firebase.deintegrate))
		
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddAzure, this.azure.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AzureSetup, this.azure.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AzureDeploy, this.azure.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AzureDeintegrate, this.azure.deintegrate))
		
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddAlibaba, this.alibaba.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AlibabaSetup, this.alibaba.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AlibabaDeploy, this.alibaba.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AlibabaDeintegrate, this.alibaba.deintegrate))
		
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddVercel, this.vercel.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.VercelSetup, this.vercel.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.VercelDeploy, this.vercel.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.VercelDeintegrate, this.vercel.deintegrate))
		
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddFlyIO, this.flyio.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FlyIOSetup, this.flyio.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FlyIODeploy, this.flyio.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.FlyIODeintegrate, this.flyio.deintegrate))
		
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddCloudflare, this.cloudflare.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.CloudflareSetup, this.cloudflare.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.CloudflareDeploy, this.cloudflare.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.CloudflareDeintegrate, this.cloudflare.deintegrate))
		
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddDigitalOcean, this.digitalocean.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DigitalOceanSetup, this.digitalocean.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DigitalOceanDeploy, this.digitalocean.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DigitalOceanDeintegrate, this.digitalocean.deintegrate))
		
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddHeroku, this.heroku.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HerokuSetup, this.heroku.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HerokuDeploy, this.heroku.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HerokuDeintegrate, this.heroku.deintegrate))
		
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AddYandexCloud, this.yandex.add))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.YandexCloudSetup, this.yandex.setup))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.YandexCloudDeploy, this.yandex.deploy))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.YandexCloudDeintegrate, this.yandex.deintegrate))
	}

	hotReloadHashes: any = {}
	
	async onDidSaveTextDocument(document: TextDocument) {
		super.onDidSaveTextDocument(document)
		if (!isInContainer) return
		if (!isHotRebuildEnabled) return
		// if (document.isDirty) return
		if (document.uri.scheme === 'file') {
			const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
			print(`onDidSaveTextDocument languageId: ${document.languageId}`, LogLevel.Unbearable)
			async function goThroughHashCheck(ctx: WebStream, handler: () => Promise<void>) {
				const oldChecksum = ctx.hotReloadHashes[document.uri.path]
				const newChecksum = generateChecksum(document.getText())
				print(`Checking ${document.uri.path.split('/').pop()}\noldChecksum: ${oldChecksum}\nnewChecksum: ${newChecksum}`, LogLevel.Unbearable)
				if (oldChecksum && oldChecksum === newChecksum) {
					print(`Skipping hot realod, file wasn't changed: ${document.uri.path.split('/').pop()}`, LogLevel.Verbose)
				} else {
					try {
						await handler()
						ctx.hotReloadHashes[document.uri.path] = newChecksum
					} catch (error) {
						const json = JSON.stringify(error)
						print(`${document.uri.path.split('/').pop()} failed to hot realod: ${json === '{}' ? error : json}`, LogLevel.Verbose)
					}
				}
			}
			// Swift
			if (['swift'].includes(document.languageId)) {
				// Package.swift
				if (document.uri.path === `${projectDirectory}/Package.swift`) {
					await goThroughHashCheck(this, async () => {
						await hotRebuildSwift(this)
					})
				}
				// Swift sources
				else if (document.uri.path.startsWith(`${projectDirectory}/Sources/`)) {
					const target = `${document.uri.path}`.replace(`${projectDirectory}/Sources/`, '').split('/')[0]
					if (target) {
						await goThroughHashCheck(this, async () => {
							await hotRebuildSwift(this, { target: target })
						})
					}
				}
			}
			// Web sources
			else if (document.uri.path.startsWith(`${projectDirectory}/${webSourcesFolder}`)) {
				// CSS
				if (['css', 'scss', 'sass'].includes(document.languageId)) {
					await goThroughHashCheck(this, async () => {
						await hotRebuildCSS(this)
					})
				}
				// JavaScript
				else if (['javascript', 'typescript', 'typescriptreact'].includes(document.languageId) || document.uri.path === `${projectDirectory}/${webSourcesFolder}/tsconfig.json`) {
					await goThroughHashCheck(this, async () => {
						await hotRebuildJS(this, { path: document.uri.path })
					})
				}
				// HTML
				else if (['html'].includes(document.languageId.toLowerCase())) {
					await goThroughHashCheck(this, async () => {
						await hotRebuildHTML(this)
					})
				}
			}
			// VSCode configuration files
			else if (document.languageId === 'jsonc' && document.uri.scheme === 'file') {
				// devcontainer.json
				if (document.uri.path == devContainerPath) {
					const readPorts = await readPortsFromDevContainer()
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
				}
			}
		}
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

	async buildDebug() {
		await buildCommand(this)
	}

	async buildRelease(successCallback?: any) {
		await buildReleaseCommand(successCallback)
	}

	// MARK: Side Bar Tree View Items

	async debugActionItems(): Promise<Dependency[]> {
		return [
			new Dependency(SideTreeItem.DebugInChrome, isDebuggingInChrome ? 'Debugging in Chrome' : 'Debug in Chrome', '', TreeItemCollapsibleState.None, isDebuggingInChrome ? 'sync~spin::charts.blue' : 'debug-alt::charts.blue'),
			new Dependency(SideTreeItem.RunCrawlServer, isRunningCrawlServer ? 'Running Crawl Server' : 'Run Crawl Server', '', TreeItemCollapsibleState.None, isRunningCrawlServer ? 'sync~spin' : 'debug-console')
		]
	}

	async debugOptionItems(): Promise<Dependency[]> {
		return [
			new Dependency(SideTreeItem.HotReload, 'Hot reload', isHotReloadEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isHotReloadEnabled ? 'pass::charts.green' : 'circle-large-outline'),
			new Dependency(SideTreeItem.DebugGzip, 'Gzip', isDebugGzipEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isDebugGzipEnabled ? 'pass::charts.green' : 'circle-large-outline'),
			new Dependency(SideTreeItem.DebugBrotli, 'Brotli', isDebugBrotliEnabled ? 'Enabled' : 'Disabled', TreeItemCollapsibleState.None, isDebugBrotliEnabled ? 'pass::charts.green' : 'circle-large-outline')
		]
	}

	async releaseItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		if (this.firebase.isInstalled === true)
			items.push(new Dependency(SideTreeItem.Firebase, 'Firebase', '', TreeItemCollapsibleState.Collapsed, sidebarTreeView!.fileIcon('firebase3')))
		if (this.azure.isInstalled === true)
			items.push(new Dependency(SideTreeItem.Azure, 'Azure', '', TreeItemCollapsibleState.Collapsed, sidebarTreeView!.fileIcon('azure3')))
		if (this.alibaba.isInstalled === true)
			items.push(new Dependency(SideTreeItem.Alibaba, 'Alibaba Cloud', '', TreeItemCollapsibleState.Collapsed, sidebarTreeView!.fileIcon('alibabacloud3')))
		if (this.vercel.isInstalled === true)
			items.push(new Dependency(SideTreeItem.Vercel, 'Vercel', '', TreeItemCollapsibleState.Collapsed, sidebarTreeView!.fileIcon('vercel-dark3', 'vercel-light3')))
		if (this.flyio.isInstalled === true)
			items.push(new Dependency(SideTreeItem.FlyIO, 'Fly.io', '', TreeItemCollapsibleState.Collapsed, sidebarTreeView!.fileIcon('flyio3')))
		if (this.cloudflare.isInstalled === true)
			items.push(new Dependency(SideTreeItem.Cloudflare, 'Cloudflare', '', TreeItemCollapsibleState.Collapsed, sidebarTreeView!.fileIcon('cloudflare3')))
		if (this.digitalocean.isInstalled === true)
			items.push(new Dependency(SideTreeItem.DigitalOcean, 'DigitalOcean', '', TreeItemCollapsibleState.Collapsed, sidebarTreeView!.fileIcon('digitalocean3')))
		if (this.heroku.isInstalled === true)
			items.push(new Dependency(SideTreeItem.Heroku, 'Heroku', '', TreeItemCollapsibleState.Collapsed, sidebarTreeView!.fileIcon('heroku3')))
		if (this.yandex.isInstalled === true)
			items.push(new Dependency(SideTreeItem.YandexCloud, 'Yandex Cloud', '', TreeItemCollapsibleState.Collapsed, sidebarTreeView!.fileIcon('yandexcloud3')))
		var inactiveProviders: boolean[] = [
			this.alibaba.isInstalled === false,
			this.azure.isInstalled === false,
			this.cloudflare.isInstalled === false,
			this.digitalocean.isInstalled === false,
			this.heroku.isInstalled === false,
			this.vercel.isInstalled === false,
			this.yandex.isInstalled === false
		]
		var activeProviders: boolean[] = [
			this.firebase.isInstalled === false,
			this.flyio.isInstalled === false
		]
		if (activeProviders.includes(true)) {
			items.push(new Dependency(SideTreeItem.AddCloudProvider, 'Add Cloud Provider', '', TreeItemCollapsibleState.Collapsed, 'cloud'))
		}
		return items
	}

	async projectItems(): Promise<Dependency[]> {
		// return [
		// 	new Dependency(SideTreeItem.NewFilePage, 'New Page', '', TreeItemCollapsibleState.None, 'file-add'),
		// 	new Dependency(SideTreeItem.NewFileClass, 'New Class', '', TreeItemCollapsibleState.None, 'file-code'),
		// 	new Dependency(SideTreeItem.NewFileJS, 'New JS', '', TreeItemCollapsibleState.None, 'file-code'),
		// 	new Dependency(SideTreeItem.NewFileSCSS, 'New CSS', '', TreeItemCollapsibleState.None, 'file-code')
		// ]
		return []
	}

	async maintenanceItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		if (await this.containsAppTarget() && this.canRecompileAppTarget())
			items.push(new Dependency(SideTreeItem.RecompileApp, isRecompilingApp ? 'Recompiling' : 'Recompile', appTargetName, TreeItemCollapsibleState.None, isRecompilingApp ? 'sync~spin' : 'repl'))
		if (await this.containsServiceTarget() && this.canRecompileServiceTarget())
			items.push(new Dependency(SideTreeItem.RecompileService, isRecompilingService ? 'Recompiling' : 'Recompile', serviceWorkerTargetName, TreeItemCollapsibleState.None, isRecompilingService ? 'sync~spin' : 'server~spin'))
		items.push(new Dependency(SideTreeItem.RecompileJS, isRecompilingJS ? 'Recompiling' : 'Recompile', 'JS', TreeItemCollapsibleState.None, isRecompilingJS ? 'sync~spin' : 'code'))
		items.push(new Dependency(SideTreeItem.RecompileCSS, isRecompilingCSS ? 'Recompiling' : 'Recompile', 'CSS', TreeItemCollapsibleState.None, isRecompilingCSS ? 'sync~spin' : 'symbol-color'))
		items.push(new Dependency(SideTreeItem.RecompileHTML, isRecompilingHTML ? 'Recompiling' : 'Recompile', 'HTML', TreeItemCollapsibleState.None, isRecompilingHTML ? 'sync~spin' : 'compass'))
		return items
	}

	async settingsItems(): Promise<Dependency[]> {
		return [
			new Dependency(SideTreeItem.DevPort, 'Port (debug)', `${currentDevPort} ${pendingNewDevPort && pendingNewDevPort != currentDevPort ? `(${pendingNewDevPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower'),
			new Dependency(SideTreeItem.ProdPort, 'Port (release)', `${currentProdPort} ${pendingNewProdPort && pendingNewProdPort != currentProdPort ? `(${pendingNewProdPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower'),
			new Dependency(SideTreeItem.DevCrawlerPort, 'Port (crawler)', `${currentDevCrawlerPort} ${pendingNewDevCrawlerPort && pendingNewDevCrawlerPort != currentDevCrawlerPort ? `(${pendingNewDevCrawlerPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower')
		]
	}

	async isThereAnyRecommendation(): Promise<boolean> {
		return false
	}

	async recommendationsItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		if (containsUpdateForWeb)
			items.push(new Dependency(SideTreeItem.UpdateWeb, 'Update Web to 2.0.0', '', TreeItemCollapsibleState.None, 'cloud-download'))
		if (containsUpdateForJSKit)
			items.push(new Dependency(SideTreeItem.UpdateJSKit, 'Update JSKit to 0.20.0', '', TreeItemCollapsibleState.None, 'cloud-download'))
		if (items.length == 0)
			items.push(new Dependency(SideTreeItem.UpdateJSKit, 'No recommendations for now', '', TreeItemCollapsibleState.None, 'check::charts.green', false))
		return items
	}

	async customItems(element: Dependency): Promise<Dependency[]> {
		let items: Dependency[] = []
		switch (element.id) {
		case SideTreeItem.Azure:
			if (await this.azure.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.AzureSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.AzureDeploy, this.azure.isLoggingIn ? 'Logging in' : this.azure.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, this.azure.isLoggingIn || this.azure.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.AzureDeintegrate, this.azure.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, this.azure.isDeintegrating ? 'sync~spin' : 'trash'))
			break
		case SideTreeItem.Alibaba:
			if (await this.alibaba.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.AlibabaSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.AlibabaDeploy, this.alibaba.isLoggingIn ? 'Logging in' : this.alibaba.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, this.alibaba.isLoggingIn || this.alibaba.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.AlibabaDeintegrate, this.alibaba.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, this.alibaba.isDeintegrating ? 'sync~spin' : 'trash'))
			break
		case SideTreeItem.Vercel:
			if (await this.vercel.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.VercelSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.VercelDeploy, this.vercel.isLoggingIn ? 'Logging in' : this.vercel.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, this.vercel.isLoggingIn || this.vercel.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.VercelDeintegrate, this.vercel.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, this.vercel.isDeintegrating ? 'sync~spin' : 'trash'))
			break
		case SideTreeItem.Firebase:
			if (await this.firebase.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.FirebaseSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.FirebaseDeploy, this.firebase.isLoggingIn ? 'Logging in' : this.firebase.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, this.firebase.isLoggingIn || this.firebase.isDeploying ? 'sync~spin' : 'cloud-upload'))
				const fullDeployMode = this.firebase.getFullDeployMode()
				if (fullDeployMode != undefined) {
					items.push(new Dependency(SideTreeItem.FirebaseDeployMode, 'Deploy Mode', fullDeployMode ? 'Full' : 'Hosting Only', TreeItemCollapsibleState.None, 'settings'))
				}
			}
			items.push(new Dependency(SideTreeItem.FirebaseDeintegrate, this.firebase.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, this.firebase.isDeintegrating ? 'sync~spin' : 'trash'))
			break
		case SideTreeItem.FlyIO:
			if (await this.flyio.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.FlyIOSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.FlyIODeploy, this.flyio.isLoggingIn ? 'Logging in' : this.flyio.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, this.flyio.isLoggingIn || this.flyio.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.FlyIODeintegrate, this.flyio.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, this.flyio.isDeintegrating ? 'sync~spin' : 'trash'))
			break
		case SideTreeItem.Cloudflare:
			if (await this.cloudflare.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.CloudflareSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.CloudflareDeploy, this.cloudflare.isLoggingIn ? 'Logging in' : this.cloudflare.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, this.cloudflare.isLoggingIn || this.cloudflare.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.CloudflareDeintegrate, this.cloudflare.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, this.cloudflare.isDeintegrating ? 'sync~spin' : 'trash'))
			break
		case SideTreeItem.DigitalOcean:
			if (await this.digitalocean.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.DigitalOceanSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.DigitalOceanDeploy, this.digitalocean.isLoggingIn ? 'Logging in' : this.digitalocean.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, this.digitalocean.isLoggingIn || this.digitalocean.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.DigitalOceanDeintegrate, this.digitalocean.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, this.digitalocean.isDeintegrating ? 'sync~spin' : 'trash'))
			break
		case SideTreeItem.Heroku:
			if (await this.heroku.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.HerokuSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.HerokuDeploy, this.heroku.isLoggingIn ? 'Logging in' : this.heroku.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, this.heroku.isLoggingIn || this.heroku.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.HerokuDeintegrate, this.heroku.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, this.heroku.isDeintegrating ? 'sync~spin' : 'trash'))
			break
		case SideTreeItem.YandexCloud:
			if (await this.yandex.isPresentInProject() === false) {
				items.push(new Dependency(SideTreeItem.YandexCloudSetup, 'Setup', '', TreeItemCollapsibleState.None, 'symbol-property'))
			} else {
				items.push(new Dependency(SideTreeItem.YandexCloudDeploy, this.yandex.isLoggingIn ? 'Logging in' : this.yandex.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, this.yandex.isLoggingIn || this.yandex.isDeploying ? 'sync~spin' : 'cloud-upload'))
			}
			items.push(new Dependency(SideTreeItem.YandexCloudDeintegrate, this.yandex.isDeintegrating ? 'Deintegrating' : 'Deintegrate', '', TreeItemCollapsibleState.None, this.yandex.isDeintegrating ? 'sync~spin' : 'trash'))
			break
		case SideTreeItem.AddCloudProvider:
			if (this.firebase.isInstalled === false)
				items.push(new Dependency(SideTreeItem.AddFirebase, 'Firebase', this.firebase.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, sidebarTreeView!.fileIcon('firebase3')))
			// if (this.azure.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddAzure, 'Azure', this.azure.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, sidebarTreeView!.fileIcon('azure3')))
			// if (this.alibaba.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddAlibaba, 'Alibaba Cloud', this.alibaba.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, sidebarTreeView!.fileIcon('alibabacloud3')))
			// if (this.vercel.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddVercel, 'Vercel', this.vercel.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, sidebarTreeView!.fileIcon('vercel-dark3', 'vercel-light3')))
			if (this.flyio.isInstalled === false)
				items.push(new Dependency(SideTreeItem.AddFlyIO, 'Fly.io', this.flyio.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, sidebarTreeView!.fileIcon('flyio3')))
			// if (this.cloudflare.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddCloudflare, 'Cloudflare', this.cloudflare.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, sidebarTreeView!.fileIcon('cloudflare3')))
			// if (this.digitalocean.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddDigitalOcean, 'DigitalOcean', this.digitalocean.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, sidebarTreeView!.fileIcon('digitalocean3')))
			// if (this.heroku.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddHeroku, 'Heroku', this.heroku.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, sidebarTreeView!.fileIcon('heroku3')))
			// if (this.yandex.isInstalled === false)
			// 	items.push(new Dependency(SideTreeItem.AddYandexCloud, 'Yandex Cloud', this.yandex.isPendingContainerRebuild ? 'pending container rebuild' : '', TreeItemCollapsibleState.None, sidebarTreeView!.fileIcon('yandexcloud3')))
			break
		default: break
		}
		return items
	}

	// MARK: Helpers

	async containsAppTarget() {
		if (!currentStream) return false
		const targetsDump = cachedSwiftTargets ?? await currentStream.swift.getTargets()
		return targetsDump.executables.includes(appTargetName)
	}
	
	canRecompileAppTarget() {
		return fs.existsSync(`${projectDirectory}/.build/debug/${appTargetName}`)
	}

	async containsServiceTarget() {
		if (!currentStream) return false
		const targetsDump = cachedSwiftTargets ?? await currentStream.swift.getTargets()
		return targetsDump.serviceWorkers.includes(serviceWorkerTargetName)
	}

	canRecompileServiceTarget() {
		return fs.existsSync(`${projectDirectory}/.build/debug/${serviceWorkerTargetName}`)
	}
}