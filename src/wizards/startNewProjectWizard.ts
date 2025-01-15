import * as fs from 'fs'
import * as os from 'os'
import { commands, extensions, Uri, ViewColumn, WebviewPanel, window } from 'vscode'
import { selectFolder } from '../helpers/selectFolderHelper'
import { defaultServerPort, defaultWebDevPort, defaultWebProdPort, extensionContext } from '../extension'
import { sortLibraryFilePaths } from '../helpers/sortLibraryFilePaths'
import { checkPortAndGetNextIfBusy } from '../helpers/checkPortAndGetNextIfBusy'
import { webSourcesFolder } from '../webber'
import { FileBuilder } from '../helpers/fileBuilder'
import Handlebars from 'handlebars'
import { copyFile, readFile } from '../helpers/filesHelper'
import * as osPath from 'path'
import { openProject } from '../helpers/openProject'

let webViewPanel: WebviewPanel | undefined
const isWin = process.platform == 'win32'

export async function startNewProjectWizard() {
	if (webViewPanel) { return }
	webViewPanel = window.createWebviewPanel(
		'swiftstream',
		'Swift Stream',
		ViewColumn.One,
		{// Enable scripts in the webview
			enableScripts: true
		}
	)
	webViewPanel.onDidDispose(() => {
		webViewPanel = undefined
	})
	webViewPanel.onDidChangeViewState((e) => {
		console.dir(e)
	})
	webViewPanel.iconPath = Uri.file(osPath.join(extensionContext.extensionPath, 'media', 'favicon.ico'))
	const htmlPath = Uri.file(osPath.join(extensionContext.extensionPath, 'media', 'startNewProject.html'))
	const basePath: string = webViewPanel.webview.asWebviewUri(Uri.file(osPath.join(extensionContext.extensionPath, 'media'))).toString()
	webViewPanel.webview.html = fs.readFileSync(htmlPath.fsPath, 'utf8')
		.replaceAll('__LF__', basePath)
	webViewPanel?.webview.onDidReceiveMessage(async (event) => {
		switch (event.command) {
			case 'createNewProject':
				await createNewProjectFiles(
					event.payload.name,
					event.payload.path,
					event.payload.selectedValues,
					event.payload.libraryFiles
				)
				break
			case 'openNewProject':
				commands.executeCommand(`vscode.openFolder`, Uri.parse(osPath.normalize(event.payload.path)))
				break
			case 'getUserHomePath':
				webViewPanel?.webview.postMessage({ type: 'userHomePath', data: { path: os.homedir() } })
				break
			case 'selectFolder':
				const folderPath = (await selectFolder('Please select a folder for the project', 'Select'))?.fsPath
				if (folderPath) {
					webViewPanel?.webview.postMessage({ type: event.payload.type, data: { path: folderPath } })
				}
				break
		}
	})
	webViewPanel?.reveal()
}

async function createNewProjectFiles(
	name: string,
    path: string,
	selectedValues: any,
	libraryFiles: string[]
) {
	function capitalizeFirstLetter(string: string) {
		return string[0].toUpperCase() + string.slice(1);
	}
	name = capitalizeFirstLetter(name)
	var pathWasExists = true
	try {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path)
			pathWasExists = false
		}
		if (fs.existsSync(osPath.join(path, 'Package.swift'))) {
			const rewriteContent = await window.showWarningMessage(
				`
				Folder already contains Package.swift.
				Would you like to overwrite it?
				`,
				'Rewrite',
				'Cancel'
			)
			if (rewriteContent != 'Rewrite') {
				webViewPanel?.webview.postMessage({ type: 'creatingFailed', data: {} })
				return
			}
		}
		if (!fs.existsSync(osPath.join(path, '.devcontainer'))) {
			fs.mkdirSync(osPath.join(path, '.devcontainer'))
		}
		const devContainerPath = osPath.join(path, '.devcontainer', 'devcontainer.json')
		const streamType = selectedValues['stream']
		const copyDevContainerFile = async (from: string, to?: string) => {
			await copyFile(osPath.join('assets', 'Devcontainer', streamType, from), osPath.join(path, '.devcontainer', to ?? from))
		}
		const copySourceFile = async (from: string, to?: string) => {
			await copyFile(osPath.join('assets', 'Sources', streamType, from), osPath.join(path, to ?? from))
		}
		// MARK: TARGETS
		const buildTarget = (type: string, name: string, options: { dependencies?: string[], resources?: string[], plugins?: string[] }) => {
			var items: string[] = []
			items.push(`name: "${name}"`)
			function arrayItems(name: string, items: string[]): string {
				return `${name}: [\n                ${items.join(',\n                ')}\n            ]`
			}
			if (options.dependencies && options.dependencies.length > 0) {
				items.push(arrayItems('dependencies', options.dependencies))
			}
			if (options.resources && options.resources.length > 0) {
				items.push(arrayItems('resources', options.resources))
			}
			if (options.plugins && options.plugins.length > 0) {
				items.push(arrayItems('plugins', options.plugins))
			}
			return `.${type}(\n            ${items.join(',\n            ')}\n        )`
		}
		var targets: string[] = []
		var platforms: string[] = []
		var products: string[] = []
		var dependencies: string[] = []
		function createPackageManifest() {
			// MARK: PACKAGE
			var packageItems: string[] = []
			packageItems.push(`name: "${name}"`)
			function packageArrayItems(name: string, items: string[]): string {
				return `${name}: [\n        ${items.join(',\n        ')}\n    ]`
			}
			if (platforms.length > 0) {
				packageItems.push(packageArrayItems('platforms', platforms))
			}
			if (products.length > 0) {
				packageItems.push(packageArrayItems('products', products))
			}
			if (dependencies.length > 0) {
				packageItems.push(packageArrayItems('dependencies', dependencies))
			}
			if (targets.length > 0) {
				packageItems.push(packageArrayItems('targets', targets))
			}
			var packageSwift = `// swift-tools-version: 6.0` // TODO: swift version
			packageSwift += `\nimport PackageDescription`
			packageSwift += `\n`
			packageSwift += `\nlet package = Package(`
			packageSwift += `\n    ${packageItems.join(',\n    ')}`
			packageSwift += `\n)`
			fs.writeFileSync(osPath.join(path, 'Package.swift'), packageSwift)
		}
		Handlebars.registerHelper('eq', (a, b) => a === b)
		Handlebars.registerHelper('arrNotEmpty', (a) => a && a.length > 0)
		switch (streamType) {
			case 'web':
				const webType = selectedValues['web-type']
				const webLibType = selectedValues['web-lib-type']
				const webAppStyle = selectedValues['web-app-style']
				// Copy devcontainer files
				await copyDevContainerFile(`Dockerfile`)
				// TODO: if swift 5
				await copyDevContainerFile(`devcontainer5.json`, `devcontainer.json`) // TODO: swift version
				// Copy .gitignore
				await copySourceFile(`.gitignore`)
				var devContainerContent: string = fs.readFileSync(devContainerPath, 'utf8')
				if (devContainerContent) {
					const availableDevPort = await checkPortAndGetNextIfBusy(defaultWebDevPort)
					const availableProdPort = await checkPortAndGetNextIfBusy(defaultWebProdPort)
					devContainerContent = devContainerContent.replace(`${defaultWebDevPort}:443`, `${availableDevPort}:443`)
					devContainerContent = devContainerContent.replace(`${defaultWebProdPort}:444`, `${availableProdPort}:444`)
					fs.writeFileSync(devContainerPath, devContainerContent)
				}
				// Copy WebSources
				if (!fs.existsSync(osPath.join(path, 'WebSources'))) {
					fs.mkdirSync(osPath.join(path, 'WebSources'))
				}
				['app.js', 'index.html', 'serviceWorker.js', 'webpack.config.js'].forEach(async (file) => {
					await copySourceFile(file, osPath.join('WebSources', file))
				})
				await copySourceFile('placeholder.ts.js', osPath.join('WebSources', 'placeholder.ts'))
				await copySourceFile(`_tsconfig.json`, osPath.join('WebSources', 'tsconfig.json'))
				if (!fs.existsSync(osPath.join(path, 'WebSources', 'wasi'))) {
					fs.mkdirSync(osPath.join(path, 'WebSources', 'wasi'))
				}
				['devSocket.js', 'errorHandler.js', 'overrideFS.js', 'startTask.js'].forEach(async (file) => {
					await copySourceFile(osPath.join('wasi', file), osPath.join('WebSources', 'wasi', file))
				})
				// Copy images
				if (webType == 'spa') {
					const p = osPath.join(path, 'Sources', 'App')
					if (!fs.existsSync(p)) {
						fs.mkdirSync(p, { recursive: true })
					}
					await copyFile(osPath.join('media', 'favicon.ico'), osPath.join(p, 'favicon.ico'))
				} else if (webType != 'lib') {
					const p = osPath.join(path, 'Sources', 'Service', 'images')
					if (!fs.existsSync(p)) {
						fs.mkdirSync(p, { recursive: true })
					}
					await copyFile(osPath.join('media', 'favicon.ico'), osPath.join(p, 'favicon.ico'))
					await copyFile(osPath.join('media', 'icon-192.png'), osPath.join(p, 'icon-192.png'))
					await copyFile(osPath.join('media', 'icon-512.png'), osPath.join(p, 'icon-512.png'))
				}
				const swifWebRepo = 'https://github.com/swifweb'
				const sortedLibraryFilePaths = sortLibraryFilePaths(libraryFiles)
				// MARK: PLATFORMS
				platforms.push(`.macOS(.v10_15)`)
				// MARK: PRODUCTS
				if (webType == 'lib') {
					products.push(`.library(name: "${name}", type: .static, targets: ["${name}"])`)
				} else {
					products.push(`.executable(name: "App", targets: ["App"])`)
				}
				if (webType != 'spa' && webType != 'lib') {
					products.push(`.executable(name: "Service", targets: ["Service"])`)
				}
				// MARK: DEPENDENCIES
				dependencies.push(`.package(url: "${swifWebRepo}/web", from: "1.0.0-beta.3.0.0")`)
				if (webAppStyle == `tailwind`) {
					dependencies.push(`.package(url: "${swifWebRepo}/tailwind", from: "1.0.0")`)
					products.push(`.product(name: "Tailwind", package: "tailwind")`)
				} else if (webAppStyle == `bootstrap`) {
					dependencies.push(`.package(url: "${swifWebRepo}/bootstrap", from: "0.0.1")`)
					products.push(`.product(name: "Bootstrap", package: "bootstrap")`)
				} else if (webAppStyle == `materialize`) {
					dependencies.push(`.package(url: "${swifWebRepo}/materialize", from: "1.0.0")`)
					products.push(`.product(name: "Materialize", package: "materialize")`)
				} else if (webAppStyle == `semantic`) {
					dependencies.push(`.package(url: "${swifWebRepo}/semantic", from: "1.0.0")`)
					products.push(`.product(name: "SemanticUI", package: "semantic-ui")`)
				}
				if (webType == 'lib') {
					var libResourcesArray: string[] = []
					enum LibraryFileType { js = 'js', css = 'css', fonts = 'fonts' }
					function parseStructuredLibraryFiles(type: LibraryFileType) {
						if (sortedLibraryFilePaths[type].length == 0) { return }
						const assetPath = osPath.join(path, 'Sources', name, type)
						if (!fs.existsSync(assetPath)) {
							fs.mkdirSync(assetPath, { recursive: true })
						}
						sortedLibraryFilePaths[type].forEach(src => {
							const filename = osPath.parse(src).base
							fs.copyFileSync(src, osPath.join(assetPath, filename))
							libResourcesArray.push(`.copy("${type}/${filename}")`)
						})
						libResourcesArray.push(`.copy("${type}")`)
					}
					parseStructuredLibraryFiles(LibraryFileType.js)
					parseStructuredLibraryFiles(LibraryFileType.css)
					parseStructuredLibraryFiles(LibraryFileType.fonts)
					const libResources: string[] = libResourcesArray.length > 0 ? libResourcesArray : ['// .copy("css/bootstrap.css")', '// .copy("css")']
					targets.push(buildTarget('target', name, {
						dependencies: [
							'.product(name: "Web", package: "web")'
						], resources: libResources
					}))
				} else {
					targets.push(buildTarget('executableTarget', 'App', {
						dependencies: [
							'.product(name: "Web", package: "web")'
						], resources: (webType == 'spa') ? ['.copy("favicon.ico")'] : []
					}))
					if (webType != 'spa') {
						targets.push(buildTarget('executableTarget', 'Service', {
							dependencies: [
								'.product(name: "ServiceWorker", package: "web")'
							], resources: [
								'.copy("images/favicon.ico")',
								'.copy("images/icon-192.png")',
								'.copy("images/icon-512.png")',
								'.copy("images")'
							]
						}))
					}
				}
				if (webType == 'lib') {
					//MARK: MAIN LIB FILE
					let mainFile = new FileBuilder()
						.import('Web')
						.emptyLine()
						.line(`public class ${name} {`)
					if (sortedLibraryFilePaths.css.length > 0) {
						mainFile.line('    public static func configure(avoidStyles: Bool? = nil) {')
								.line('        if avoidStyles != true {')
						const paths = sortedLibraryFilePaths.css.map((path) => {
							return osPath.parse(path).base
						})
						mainFile.line(`            let files: [String] = [${paths.map(x => `"${x}"`).join(', ')}]`)
								.line('            for file in files {')
								.line('                let link = Link().rel(.stylesheet).href("/css/\\(file)")')
								.line('                WebApp.shared.document.head.appendChild(link)')
								.line('            }')
								.line('        }')
					} else {
						mainFile.line('    public static func configure() {')
					}
					if (sortedLibraryFilePaths.fonts.length > 0) {
						const fonts = sortedLibraryFilePaths.fonts.map((path) => {
							return osPath.parse(path).base
						})
						mainFile.line(`        let fonts: [String] = [${fonts.map(x => `"${x}"`).join(', ')}]`)
								.line('        WebApp.shared.document.head.appendChild(Style {')
								.line('            ForEach(fonts) { font in')
								.line('                CSSRule(Pointer(stringLiteral: "@font-face"))')
								.line('                    .fontFamily(.familyName(font.components(separatedBy: ".")[0].replacingOccurrences(of: ".", with: "")))')
								.line('                    .property(.init("src"), "/fonts/\\(font)")')
								.line('            }')
								.line('        })')
					}
					if (sortedLibraryFilePaths.js.length > 0) {
						const paths = sortedLibraryFilePaths.js.map((path) => {
							return osPath.parse(path).base
						})
						mainFile.line(`        let files: [String] = [${paths.map(x => `"${x}"`).join(', ')}]`)
								.line('        for file in files {')
								.line('            let script = Script().src("/js/\\(file)")')
								.line('            WebApp.shared.document.head.appendChild(script)')
								.line('        }')
								.line('    }')
								.line('}')
					}
					mainFile.writeFile(osPath.join(path, 'Sources', name), `${name}.swift`)
				} else if (['spa', 'pwa'].includes(webType)) {
					//MARK: MAIN APP FILE
					new FileBuilder()
						.import('Web')
						.emptyLine()
						.line('@main')
						.line('class App: WebApp {')
						.line('    @AppBuilder override var app: Configuration {')
						.line('        Lifecycle.didFinishLaunching { app in')
						.ifLine(
							  (webType == 'pwa'),
							  '            Navigator.shared.serviceWorker?.register("./service.js")'
						)
						.line('            print("Lifecycle.didFinishLaunching")')
						.line('        }.willTerminate {')
						.line('            print("Lifecycle.willTerminate")')
						.line('        }.willResignActive {')
						.line('            print("Lifecycle.willResignActive")')
						.line('        }.didBecomeActive {')
						.line('            print("Lifecycle.didBecomeActive")')
						.line('        }.didEnterBackground {')
						.line('            print("Lifecycle.didEnterBackground")')
						.line('        }.willEnterForeground {')
						.line('            print("Lifecycle.willEnterForeground")')
						.line('        }')
						.line('        Routes {')
						.line('            Page { IndexPage() }')
						.line('            Page("hello") { HelloPage() }')
						.line('            Page("**") { NotFoundPage() }')
						.line('        }')
						.line('    }')
						.line('}')
						.writeFile(osPath.join(path, 'Sources', 'App'), 'App.swift')
					// IndexPage file
					new FileBuilder()
						.import('Web')
						.emptyLine()
						.line('class IndexPage: PageController {')
						.line('    @DOM override var body: DOM.Content {')
						.line('        P("Index page")')
						.line('    }')
						.line('}')
						.writeFile(osPath.join(path, 'Sources', 'App', 'Pages'), 'IndexPage.swift')
					// HelloPage file
					new FileBuilder()
						.import('Web')
						.emptyLine()
						.line('class HelloPage: PageController {')
						.line('    @DOM override var body: DOM.Content {')
						.line('        P("HELLO page")')
						.line('            .textAlign(.center)')
						.line('            .body {')
						.line('                Button("go back").display(.block).onClick {')
						.line('                    History.back()')
						.line('                }')
						.line('            }')
						.line('    }')
						.line('}')
						.emptyLine()
						.line('class Hello_Preview: WebPreview {')
						.line('    @Preview override class var content: Preview.Content {')
						.line('        Language.en')
						.line('        Title("Hello endpoint")')
						.line('        Size(200, 200)')
						.line('        HelloPage()')
						.line('    }')
						.line('}')
						.writeFile(osPath.join(path, 'Sources', 'App', 'Pages'), 'HelloPage.swift')
					// NotFoundPage file
					new FileBuilder()
						.import('Web')
						.emptyLine()
						.line('class NotFoundPage: PageController {')
						.line('    @DOM override var body: DOM.Content {')
						.emptyLine()
						.line('        P("404 NOT FOUND page")')
						.line('            .textAlign(.center)')
						.line('            .body {')
						.line('                Button("go back").display(.block).onClick {')
						.line('                    History.back()')
						.line('                }')
						.line('            }')
						.line('    }')
						.line('}')
						.emptyLine()
						.line('class NotFound_Preview: WebPreview {')
						.line('    @Preview override class var content: Preview.Content {')
						.line('        Language.en')
						.line('        Title("Not found endpoint")')
						.line('        Size(200, 200)')
						.line('        NotFoundPage()')
						.line('    }')
						.line('}')
						.writeFile(osPath.join(path, 'Sources', 'App', 'Pages'), 'NotFoundPage.swift')
					if (webType == 'pwa') {
						// Service Worker file
						new FileBuilder()
							.import('ServiceWorker')
							.emptyLine()
							.line('@main')
							.line('public class Service: ServiceWorker {')
							.line('    @ServiceBuilder public override var body: ServiceBuilder.Content {')
							.line('        Manifest')
							.line('            .name("SwiftPWA")')
							.line('            .startURL(".")')
							.line('            .display(.standalone)')
							.line('            .backgroundColor("#2A3443")')
							.line('            .themeColor("white")')
							.line('            .icons(')
							.line('                .init(src: "images/icon-192.png", sizes: .x192, type: .png),')
							.line('                .init(src: "images/icon-512.png", sizes: .x512, type: .png)')
							.line('            )')
							.line('        Lifecycle.activate {')
							.line('            debugPrint("service activate event")')
							.line('        }.install {')
							.line('            debugPrint("service install event")')
							.line('        }.fetch {')
							.line('            debugPrint("service fetch event")')
							.line('        }.sync {')
							.line('            debugPrint("service sync event")')
							.line('        }.contentDelete {')
							.line('            debugPrint("service contentDelete event")')
							.line('        }')
							.line('    }')
							.line('}')
							.writeFile(osPath.join(path, 'Sources', 'Service'), `Service.swift`)
					}
				}
				// MARK: PACKAGE.json
				const wSourcesPath = osPath.join(path, webSourcesFolder)
				if (!fs.existsSync(wSourcesPath)) {
					fs.mkdirSync(wSourcesPath, { recursive: true })
				}
				var packageJson = {
					name: name.toLowerCase(),
					version: '1.0.0',
					devDependencies: {
						"@wasmer/wasi": "^0.12.0",
						"@wasmer/wasmfs": "^0.12.0",
						"javascript-kit-swift": "file:../.build/.wasi/checkouts/JavaScriptKit",
						"reconnecting-websocket": "^4.4.0",
						"webpack": "^5.91.0",
						"webpack-cli": "^5.1.4"
					}
				}
				fs.writeFileSync(osPath.join(wSourcesPath, 'package.json'), JSON.stringify(packageJson, null, '\t'))
				createPackageManifest()
				break
			case 'server':
				let serverType = selectedValues['server-type']
				// Copy devcontainer files
				await copyDevContainerFile(`Dockerfile`)
				await copyDevContainerFile(`devcontainer.json`)
				await (async function () {
					let devContainerContent: string = fs.readFileSync(devContainerPath, 'utf8')
					if (devContainerContent) {
						const availablePort = await checkPortAndGetNextIfBusy(defaultServerPort)
						devContainerContent = devContainerContent.replace(`${defaultServerPort}:8888`, `${availablePort}:8888`)
						fs.writeFileSync(devContainerPath, devContainerContent)
					}
				})()
				// Copy .gitignore
				await copySourceFile(osPath.join(serverType, '.gitignore'), '.gitignore')
				switch (serverType) {
					case 'vapor':
						await (async function () {
							let payload = {
								swiftToolsVersion: '6.0',
								name: name,
								platforms: '.macOS(.v13)',
								dependencies: [
									{
										comment: '// 💧 A server-side Swift web framework.',
										package: '.package(url: "https://github.com/vapor/vapor.git", from: "4.99.3")'
									},
									{
										comment: '// 🔵 Non-blocking, event-driven networking for Swift. Used for custom executors',
										package: '.package(url: "https://github.com/apple/swift-nio.git", from: "2.65.0")'
									}
								],
								targets: [
									{
										type: 'executableTarget',
										name: name,
										dependencies: [
											'.product(name: "Vapor", package: "vapor")',
											'.product(name: "NIOCore", package: "swift-nio")',
											'.product(name: "NIOPosix", package: "swift-nio")'
										],
										swiftSettings: true
									},
									{
										type: 'testTarget',
										name: `${name}Tests`,
										dependencies: [
											`.target(name: "${name}")`,
											'.product(name: "XCTVapor", package: "vapor")'
										],
										swiftSettings: true
									}
								],
								swiftLanguageModes: '.v5',
								swiftSettings: [
									'.enableUpcomingFeature("DisableOutwardActorInference")',
									'.enableExperimentalFeature("StrictConcurrency")'
								]
							}
							fs.writeFileSync(
								osPath.join(path, 'Package.swift'),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', 'Package.hbs')))(payload)
							)
							fs.writeFileSync(
								osPath.join(path, 'Dockerfile'),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', streamType, serverType, 'Dockerfile.hbs')))(payload)
							)
							copySourceFile(`docker-compose.yml`)
							const sourcesFolder = osPath.join(path, 'Sources')
							if (!fs.existsSync(sourcesFolder)) {
								fs.mkdirSync(sourcesFolder, { recursive: true })
							}
							const appSourcesFolder = osPath.join(path, 'Sources', name)
							if (!fs.existsSync(appSourcesFolder)) {
								fs.mkdirSync(appSourcesFolder, { recursive: true })
							}
							fs.writeFileSync(
								osPath.join(appSourcesFolder, 'configure.swift'),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', streamType, serverType, 'Sources', 'App', 'configure.hbs')))(payload)
							)
							fs.writeFileSync(
								osPath.join(appSourcesFolder, 'entrypoint.swift'),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', streamType, serverType, 'Sources', 'App', 'entrypoint.hbs')))(payload)
							)
							fs.writeFileSync(
								osPath.join(appSourcesFolder, 'routes.swift'),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', streamType, serverType, 'Sources', 'App', 'routes.hbs')))(payload)
							)
							const controllersAppSourcesFolder = osPath.join(path, 'Sources', name, 'Controllers')
							if (!fs.existsSync(controllersAppSourcesFolder)) {
								fs.mkdirSync(controllersAppSourcesFolder, { recursive: true })
							}
							fs.writeFileSync(osPath.join(controllersAppSourcesFolder, '.gitkeep'), '')
							const testsFolder = osPath.join(path, 'Tests')
							if (!fs.existsSync(testsFolder)) {
								fs.mkdirSync(testsFolder, { recursive: true })
							}
							const appTestsFolder = osPath.join(path, 'Tests', `${name}Tests`)
							if (!fs.existsSync(appTestsFolder)) {
								fs.mkdirSync(appTestsFolder, { recursive: true })
							}
							fs.writeFileSync(
								osPath.join(appTestsFolder, `${name}Tests.swift`),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', streamType, serverType, 'Tests', 'AppTests', 'AppTests.hbs')))(payload)
							)
						})()
						break
					case 'hummingbird':
						await (async function () {
							let payload = {
								swiftToolsVersion: '6.0',
								name: name,
								platforms: '.macOS(.v14), .iOS(.v17), .tvOS(.v17)',
								products: [
									`.executable(name: "${name}", targets: ["${name}"])`
								],
								dependencies: [
									{
										package: '.package(url: "https://github.com/hummingbird-project/hummingbird.git", from: "2.0.0")'
									},
									{
										package: '.package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.3.0")'
									}
								],
								targets: [
									{
										type: 'executableTarget',
										name: name,
										dependencies: [
											'.product(name: "ArgumentParser", package: "swift-argument-parser")',
											'.product(name: "Hummingbird", package: "hummingbird")'
										]
									},
									{
										type: 'testTarget',
										name: `${name}Tests`,
										dependencies: [
											`.byName(name: "${name}")`,
											'.product(name: "HummingbirdTesting", package: "hummingbird")'
										]
									}
								]
							}
							fs.writeFileSync(
								osPath.join(path, 'Package.swift'),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', 'Package.hbs')))(payload)
							)
							fs.writeFileSync(
								osPath.join(path, 'Dockerfile'),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', streamType, serverType, 'Dockerfile.hbs')))(payload)
							)
							const sourcesFolder = osPath.join(path, 'Sources')
							if (!fs.existsSync(sourcesFolder)) {
								fs.mkdirSync(sourcesFolder, { recursive: true })
							}
							const appSourcesFolder = osPath.join(path, 'Sources', name)
							if (!fs.existsSync(appSourcesFolder)) {
								fs.mkdirSync(appSourcesFolder, { recursive: true })
							}
							fs.writeFileSync(
								osPath.join(appSourcesFolder, 'App.swift'),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', streamType, serverType, 'Sources', 'App', 'App.hbs')))(payload)
							)
							fs.writeFileSync(
								osPath.join(appSourcesFolder, 'Application+Build.swift'),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', streamType, serverType, 'Sources', 'App', 'Application+Build.hbs')))(payload)
							)
							const testsFolder = osPath.join(path, 'Tests')
							if (!fs.existsSync(testsFolder)) {
								fs.mkdirSync(testsFolder, { recursive: true })
							}
							const appTestsFolder = osPath.join(path, 'Tests', `${name}Tests`)
							if (!fs.existsSync(appTestsFolder)) {
								fs.mkdirSync(appTestsFolder, { recursive: true })
							}
							fs.writeFileSync(
								osPath.join(appTestsFolder, `${name}Tests.swift`),
								Handlebars.compile(readFile(osPath.join('assets', 'Sources', streamType, serverType, 'Tests', 'AppTests', 'AppTests.hbs')))(payload)
							)
						})()
						break
					default: break
				}
				break
			case 'android':
				let androidType = selectedValues['android-type']
				// Copy devcontainer files
				await copyDevContainerFile(`Dockerfile`)
				await copyDevContainerFile(`devcontainer.json`)
				// Copy .gitignore
				await copySourceFile(`.gitignore`)
				break
			case 'embedded':
				let embeddedType = selectedValues['embedded-type']
				// Copy devcontainer files
				await copyDevContainerFile(`Dockerfile`)
				await copyDevContainerFile(`devcontainer.json`)
				await (async function () {
					let devContainerContent: string = fs.readFileSync(devContainerPath, 'utf8')
					if (devContainerContent) {
						devContainerContent = devContainerContent.replace('##SDK##', embeddedType)
						fs.writeFileSync(devContainerPath, devContainerContent)
					}
				})()
				break
			case 'package':
				const packageType = selectedValues['package-type']
				// Copy devcontainer files
				await copyDevContainerFile(`Dockerfile`)
				await copyDevContainerFile(`devcontainer.json`)
				await (async function () {
					let devContainerContent: string = fs.readFileSync(devContainerPath, 'utf8')
					if (devContainerContent) {
						const availablePort = await checkPortAndGetNextIfBusy(defaultServerPort)
						devContainerContent = devContainerContent.replace(`${defaultServerPort}:8888`, `${availablePort}:8888`)
						fs.writeFileSync(devContainerPath, devContainerContent)
					}
				})()
				const shCommand: string = fs.readFileSync(Uri.file(extensionContext.asAbsolutePath(osPath.join('assets', 'Sources', streamType, `${packageType}.sh`))).fsPath, 'utf8').trimEnd()
				fs.writeFileSync(osPath.join(path, 'launchAfterFirstStart.sh'), `${shCommand} --name ${name}`)
				break
			default: break
		}
		// MARK: OPEN PROJECT
		await openProject(Uri.parse(isWin ? `file:///${path}` : path), webViewPanel)
	} catch (error) {
		webViewPanel?.webview.postMessage({ type: 'creatingFailed', data: {} })
		window.showErrorMessage(`Unable to create project: ${error}`)
		if (!pathWasExists) {
			try {
				fs.rmSync(path, { recursive: true })
			} catch (error) {
				window.showErrorMessage(`Unable to delete: ${error}`)
			}
		}
	}
}