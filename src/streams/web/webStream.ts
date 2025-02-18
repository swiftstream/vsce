import * as fs from 'fs'
import { commands, workspace, debug, DebugSession, FileRenameEvent, FileDeleteEvent, ConfigurationChangeEvent } from 'vscode'
import { SideTreeItem } from '../../sidebarTreeView'
import { defaultWebCrawlerPort, defaultWebDevPort, defaultWebProdPort, extensionContext, isInContainer, projectDirectory, sidebarTreeView, currentStream } from '../../extension'
import { readPortsFromDevContainer } from '../../helpers/readPortsFromDevContainer'
import { createDebugConfigIfNeeded } from '../../helpers/createDebugConfigIfNeeded'
import { NPM } from '../../npm'
import { Webpack } from '../../webpack'
import { buildCommand, cachedSwiftTargets, hotRebuildCSS, hotRebuildHTML, hotRebuildJS, hotRebuildSwift } from '../../commands/build'
import { debugInChromeCommand } from '../../commands/debugInChrome'
import { hotReloadCommand } from '../../commands/hotReload'
import { hotRebuildCommand } from '../../commands/hotRebuild'
import { buildReleaseCommand } from '../../commands/buildRelease'
import { newFilePageCommand, newFileClassCommand, newFileJSCommand, newFileCSSCommand } from '../../commands/newFile'
import { portDevCommand } from '../../commands/portDev'
import { portProdCommand } from '../../commands/portProd'
import { updateWebCommand, updateJSKitCommand } from '../../commands/suggestions'
import { webDocumentationCommand, androidDocumentationCommand, vaporDocumentationCommand, hummingbirdDocumentationCommand, serverDocumentationCommand } from '../../commands/support'
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
import { portDevCrawlerCommand } from '../../commands/portDevCrawler'
import { debugGzipCommand } from '../../commands/debugGzip'
import { debugBrotliCommand } from '../../commands/debugBrotli'
import { Stream } from '../stream'

export var isHotBuildingCSS = false
export var isHotBuildingJS = false
export var isHotBuildingHTML = false
export var isHotBuildingSwift = false
export var isAnyHotBuilding: () => boolean = () => {
	return isHotBuildingCSS || isHotBuildingJS || isHotBuildingHTML || isHotBuildingSwift
}
export function setHotBuildingCSS(active: boolean) {
	isHotBuildingCSS = active
	isRecompilingCSS = active
}
export function setHotBuildingJS(active: boolean) {
	isHotBuildingJS = active
	isRecompilingJS = active
}
export function setHotBuildingHTML(active: boolean) {
	isHotBuildingHTML = active
	isRecompilingHTML = active
}
export function setHotBuildingSwift(active: boolean) {
	isHotBuildingSwift = active
	if (!active) {
		isRecompilingApp = false
		isRecompilingService = false
	}
}
export var isDebugging = false
export function setDebugging(active: boolean) {
	isDebugging = active
	commands.executeCommand('setContext', 'isDebugging', active)
}
export var isHotReloadEnabled = false
export var isHotRebuildEnabled = false
export var isDebugGzipEnabled = false
export var isDebugBrotliEnabled = false
export var isBuildingRelease = false
export var abortBuildingRelease: (() => void) | undefined
export function setAbortBuildingRelease(handler: () => void | undefined) {
	abortBuildingRelease = handler
}
export function setBuildingRelease(active: boolean) {
	if (!active) abortBuildingRelease = undefined
	isBuildingRelease = active
	commands.executeCommand('setContext', 'isBuildingRelease', active)
}
export var isRunningCrawlServer = false
export function setRunningCrawlServer(active: boolean) {
	isRunningCrawlServer = active
}
export var indexFile = 'main.html'
export var webSourcesFolder = 'WebSources'
export var appTargetName = 'App'
export var serviceWorkerTargetName = 'Service'
export var buildDevFolder = 'DevPublic'
export var buildProdFolder = 'DistPublic'
export var containsAppTarget = async () => {
	if (!currentStream) return false
	const targetsDump = cachedSwiftTargets ?? await currentStream.swift.getTargets()
	return targetsDump.executables.includes(appTargetName)
}
export var canRecompileAppTarget = () => {
	return fs.existsSync(`${projectDirectory}/.build/debug/${appTargetName}`)
}
export var containsServiceTarget = async () => {
	if (!currentStream) return false
	const targetsDump = cachedSwiftTargets ?? await currentStream.swift.getTargets()
	return targetsDump.serviceWorkers.includes(serviceWorkerTargetName)
}
export var canRecompileServiceTarget = () => {
	return fs.existsSync(`${projectDirectory}/.build/debug/${serviceWorkerTargetName}`)
}
export var isRecompilingApp = false
export function setRecompilingApp(active: boolean) { isRecompilingApp = active }
export var isRecompilingService = false
export function setRecompilingService(active: boolean) { isRecompilingService = active }
export var isRecompilingJS = false
export var isRecompilingCSS = false
export var isRecompilingHTML = false
export var containsRecommendations = true // TODO: check if contains any recommendations
export var containsUpdateForWeb = true // TODO: check if Web could be updated
export var containsUpdateForJSKit = true // TODO: check if JSKit could be updated
export var currentDevPort: string = `${defaultWebDevPort}`
export var currentDevCrawlerPort: string = `${defaultWebCrawlerPort}`
export var currentProdPort: string = `${defaultWebProdPort}`
export var pendingNewDevPort: string | undefined
export var pendingNewDevCrawlerPort: string | undefined
export var pendingNewProdPort: string | undefined

export function setPendingNewDevPort(value: string | undefined) {
	if (!isInContainer() && value) {
		currentDevPort = value
		pendingNewDevPort = undefined
	} else {
		pendingNewDevPort = value
	}
	sidebarTreeView?.refresh()
}
export function setPendingNewDevCrawlerPort(value: string | undefined) {
	if (!isInContainer() && value) {
		currentDevCrawlerPort = value
		pendingNewDevCrawlerPort = undefined
	} else {
		pendingNewDevCrawlerPort = value
	}
	sidebarTreeView?.refresh()
}
export function setPendingNewProdPort(value: string | undefined) {
	if (!isInContainer() && value) {
		currentProdPort = value
		pendingNewProdPort = undefined
	} else {
		pendingNewProdPort = value
	}
	sidebarTreeView?.refresh()
}

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
				setDebugging(false)
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
	}

	async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
		super.onDidChangeConfiguration(event)
		if (event.affectsConfiguration('web.hotReload'))
			this.setHotReload()
		if (event.affectsConfiguration('web.hotRebuild'))
			this.setHotRebuild()
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

	setHotReload(value?: boolean) {
		isHotReloadEnabled = value ?? workspace.getConfiguration().get('web.hotReload') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('web.hotReload', value)
		sidebarTreeView?.refresh()
	}

	setHotRebuild(value?: boolean) {
		isHotRebuildEnabled = value ?? workspace.getConfiguration().get('web.hotRebuild') as boolean
		if (value === true || value === false) workspace.getConfiguration().update('web.hotRebuild', value)
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

	registerCommands() {
		super.registerCommands()
		console.log(`webStream registerCommands this: ${this}`)
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Build, buildCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DebugInChrome, debugInChromeCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunCrawlServer, async () => { await this.crawlServer.startStop() }))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HotReload, hotReloadCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HotRebuild, hotRebuildCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DebugGzip, debugGzipCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DebugBrotli, debugBrotliCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFilePage, newFilePageCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileClass, newFileClassCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileJS, newFileJSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewFileSCSS, newFileCSSCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.BuildRelease, buildReleaseCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileApp, () => {
			hotRebuildSwift({ target: appTargetName })
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileService, () => {
			hotRebuildSwift({ target: serviceWorkerTargetName })
		}))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileJS, hotRebuildJS))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileCSS, hotRebuildCSS))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RecompileHTML, hotRebuildHTML))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DevPort, portDevCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ProdPort, portProdCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.DevCrawlerPort, portDevCrawlerCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.UpdateWeb, updateWebCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.UpdateJSKit, updateJSKitCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.WebDocumentation, webDocumentationCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.AndroidDocumentation, androidDocumentationCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.VaporDocumentation, vaporDocumentationCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.HummingbirdDocumentation, hummingbirdDocumentationCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ServerDocumentation, serverDocumentationCommand))
		
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
}