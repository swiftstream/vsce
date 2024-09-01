import * as fs from 'fs'
import * as os from 'os'
import { commands, extensions, Uri, ViewColumn, WebviewPanel, window, workspace } from 'vscode'
import { selectFolder } from '../helpers/selectFolderHelper'
import { extensionContext } from '../extension'
import { copyFile } from '../helpers/copyFile'
import { sortLibraryFilePaths } from '../helpers/sortLibraryFilePaths'

let webViewPanel: WebviewPanel | undefined

export async function startNewProjectWizard() {
	if (webViewPanel) { return }
	webViewPanel = window.createWebviewPanel(
		'swifweb',
		'SwifWeb',
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
	webViewPanel.iconPath = Uri.file(extensionContext.extensionPath + '/media/favicon.ico')
	const htmlPath = Uri.file(extensionContext.extensionPath + '/media/startNewProject.html')
	const basePath: string = webViewPanel.webview.asWebviewUri(Uri.file(extensionContext.extensionPath + '/media')).toString()
	webViewPanel.webview.html = fs.readFileSync(htmlPath.fsPath, 'utf8')
		.replaceAll('__LF__', basePath)
	webViewPanel?.webview.onDidReceiveMessage(async (event) => {
		switch (event.command) {
			case 'createNewProject':
				await createNewProjectFiles(
					event.payload.name,
					event.payload.path,
					event.payload.type,
					event.payload.style,
					event.payload.libraryType,
					event.payload.libraryFiles
				)
				break
			case 'openNewProject':
				commands.executeCommand(`vscode.openFolder`, Uri.parse(event.payload.path))
				break
			case 'getUserHomePath':
				webViewPanel?.webview.postMessage({ type: 'userHomePath', data: { path: os.homedir() } })
				break
			case 'selectFolder':
				const folderPath = (await selectFolder('Please select a folder for the project', 'Select'))?.path
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
    type: string,
    style: string,
	libraryType: string,
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
		if (fs.existsSync(`${path}/Package.swift`)) {
			const rewriteContent = await window.showWarningMessage(
				`
				Folder already contains Package.swift.
				Would you like to rewrite it?
				`,
				'Rewrite',
				'Cancel'
			)
			if (rewriteContent != 'Rewrite') { return }
		}
		// Copy devcontainer files
		if (!fs.existsSync(`${path}/.devcontainer`)) {
			fs.mkdirSync(`${path}/.devcontainer`)
			fs.mkdirSync(`${path}/.devcontainer/nginx`)
		}
		['Dockerfile', 'devcontainer.json', 'cmd.sh', 'nginx/default', 'nginx/mime.types', 'nginx/openssl.cnf'].forEach(async (file) => {
			await copyFile(`assets/.devcontainer/${file}`, `${path}/.devcontainer/${file}`)
		})
		// Copy vscode files
		if (!fs.existsSync(`${path}/.vscode`)) {
			fs.mkdirSync(`${path}/.vscode`)
		}
		['settings.json'].forEach(async (file) => {
			await copyFile(`assets/.vscode/${file}`, `${path}/.vscode/${file}`)
		})
		var serviceProduct = ''
		var serviceExecutableTarget = ''
		if (type != 'spa' && type != 'lib') {
			serviceProduct = `,`
			serviceProduct += `\n    .executable(name: "Service", targets: ["Service"])`
			serviceExecutableTarget = `,`
			serviceExecutableTarget += `\n    .executableTarget(name: "Service", dependencies: [`
			serviceExecutableTarget += `\n        .product(name: "ServiceWorker", package: "web")`
			serviceExecutableTarget += `\n    ], resources: [`
			serviceExecutableTarget += `\n        //.copy("images/favicon.ico"),`
			serviceExecutableTarget += `\n        //.copy("images")`
			serviceExecutableTarget += `\n    ])`
		}
		var products = ''
		if (type == 'lib') {
			products = `.library(name: "${name}", type: .static, targets: ["${name}"])`
		} else {
			products = `.executable(name: "App", targets: ["App"])${serviceProduct}`
		}
		var appTarget = `.executableTarget(`
		appTarget += `\n    name: "App",`
		appTarget += `\n    dependencies: [`
		appTarget += `\n        .product(name: "Web", package: "web")`
		appTarget += `\n    ]`
		appTarget += `\n)${serviceExecutableTarget}`
		const sortedLibraryFilePaths = sortLibraryFilePaths(libraryFiles)
		var libResourcesArray: string[] = []
		enum LibraryFileType { js = 'js', css = 'css', fonts = 'fonts' }
		function parseStructuredLibraryFiles(type: LibraryFileType) {
			if (sortedLibraryFilePaths[type].length == 0) { return }
			const assetPath = `${path}/Sources/${name}/${type}`
			if (!fs.existsSync(assetPath)) {
				fs.mkdirSync(assetPath, { recursive: true })
			}
			sortedLibraryFilePaths[type].forEach(src => {
				const pathComponents = src.split('/')
				const filename = pathComponents[pathComponents.length - 1]
				fs.copyFileSync(src, `${assetPath}/${filename}`)
				libResourcesArray.push(`.copy("${type}/${filename}")`)
			})
			libResourcesArray.push(`.copy("${type}")`)
		}
		parseStructuredLibraryFiles(LibraryFileType.js)
		parseStructuredLibraryFiles(LibraryFileType.css)
		parseStructuredLibraryFiles(LibraryFileType.fonts)
		const libResources = libResourcesArray.length > 0 ? `    ${libResourcesArray.join(`,\n            `)}` : '// .copy("css/bootstrap.css"),\n            // .copy("css")'
		var libTarget = `.target(name: "${name}", dependencies: [`
		libTarget += `\n            .product(name: "Web", package: "web")`
		libTarget += `\n        ], resources: [`
		libTarget += `\n        ${libResources}`
		libTarget += `\n        ])`
		var packageSwift = `// swift-tools-version: 5.10`
		packageSwift += `\nimport PackageDescription`
		packageSwift += `\n`
		packageSwift += `\nlet package = Package(`
		packageSwift += `\n    name: "${name}",`
		packageSwift += `\n    platforms: [`
		packageSwift += `\n        .macOS(.v10_15)`
		packageSwift += `\n    ],`
		packageSwift += `\n    products: [`
		packageSwift += `\n        ${products}`
		packageSwift += `\n    ],`
		packageSwift += `\n    dependencies: [`
		packageSwift += `\n        .package(url: "https://github.com/swifweb/web", from: "1.0.0-beta.3.0.0")`
		packageSwift += `\n    ],`
		packageSwift += `\n    targets: [`
		packageSwift += `\n        ${type == 'lib' ? libTarget : appTarget}`
		packageSwift += `\n    ]`
		packageSwift += `\n)`
		fs.writeFileSync(`${path}/Package.swift`, packageSwift)
		if (type == 'lib') {
			var mainFile = `import Web`
			mainFile += `\n`
			mainFile += `\npublic class ${name} {`
			if (sortedLibraryFilePaths.css.length > 0) {
				mainFile += `\n    public static func configure(avoidStyles: Bool? = nil) {`
				mainFile += `\n        if avoidStyles != true {`
				const paths = sortedLibraryFilePaths.css.map((path) => {
					const pathComponents = path.split('/')
					return pathComponents[pathComponents.length - 1]
				})
				mainFile += `\n            let files: [String] = [${paths.map(x => `"${x}"`).join(', ')}]`
				mainFile += `\n            for file in files {`
				mainFile += `\n                let link = Link().rel(.stylesheet).href("/css/\\(file)")`
				mainFile += `\n                WebApp.shared.document.head.appendChild(link)`
				mainFile += `\n            }`
				mainFile += `\n        }`
			} else {
				mainFile += `\n    public static func configure() {`
			}
			if (sortedLibraryFilePaths.fonts.length > 0) {
				const fonts = sortedLibraryFilePaths.fonts.map((path) => {
					const pathComponents = path.split('/')
					return pathComponents[pathComponents.length - 1]
				})
				mainFile += `\n        let fonts: [String] = [${fonts.map(x => `"${x}"`).join(', ')}]`
				mainFile += `\n        WebApp.shared.document.head.appendChild(Style {`
				mainFile += `\n            ForEach(fonts) { font in`
				mainFile += `\n                CSSRule(Pointer(stringLiteral: "@font-face"))`
				mainFile += `\n                    .fontFamily(.familyName(font.components(separatedBy: ".")[0].replacingOccurrences(of: ".", with: "")))`
				mainFile += `\n                    .property(.init("src"), "/fonts/\\(font)")`
				mainFile += `\n            }`
				mainFile += `\n        })`
			}
			if (sortedLibraryFilePaths.js.length > 0) {
				const paths = sortedLibraryFilePaths.js.map((path) => {
					const pathComponents = path.split('/')
					return pathComponents[pathComponents.length - 1]
				})
				mainFile += `\n        let files: [String] = [${paths.map(x => `"${x}"`).join(', ')}]`
				mainFile += `\n        for file in files {`
				mainFile += `\n            let script = Script().src("/js/\\(file)")`
				mainFile += `\n            WebApp.shared.document.head.appendChild(script)`
				mainFile += `\n        }`
				mainFile += `\n    }`
				mainFile += `\n}`
			}
			fs.writeFileSync(`${path}/Sources/${name}/${name}.swift`, mainFile)
		}
		if (await openProject(Uri.parse(path)) == false) {
			commands.executeCommand(`vscode.openFolder`, Uri.parse(path))
			window.showInformationMessage('containerExtension not found')
			commands.executeCommand(`vscode.openFolder`, Uri.parse(path))
		}
	} catch (error) {
		webViewPanel?.webview.postMessage({ type: 'creatingFailed', data: {} })
		window.showErrorMessage(`Unable to create project: ${error}`)
		if (!pathWasExists) {
			window.showInformationMessage(`path to be deleted: ${path}`)
			try {
				fs.rmdirSync(path, { recursive: true })
				window.showInformationMessage(`path deleted`)
			} catch (error) {
				window.showErrorMessage(`Unable to delete: ${error}`)
			}
		}
	}
}

async function openProject(folderUri: Uri): Promise<boolean> {
    const extension = extensions.getExtension('ms-vscode-remote.remote-containers')
    if (!extension) { return false }
	try {
		if (!extension.isActive) { await extension.activate() }
		webViewPanel?.webview.postMessage({ type: 'openingInContainer', data: {} })
		commands.executeCommand('remote-containers.openFolder', folderUri)
		commands.executeCommand('remote-containers.revealLogTerminal')
		return true
	} catch (error) {
		return false
	}
}