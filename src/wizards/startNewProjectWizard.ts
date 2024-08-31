import * as fs from 'fs'
import * as os from 'os'
import { commands, extensions, Uri, ViewColumn, WebviewPanel, window, workspace } from 'vscode'
import { selectFolder } from '../helpers/selectFolderHelper'
import { extensionContext } from '../extension'
import { copyFile } from '../helpers/copyFile'

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
	libraryFiles: string
) {
	try {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path)
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
			serviceProduct = `,
				.executable(name: "Service", targets: ["Service"])`
			serviceExecutableTarget = `,
				.executableTarget(name: "Service", dependencies: [
					.product(name: "ServiceWorker", package: "web")
				], resources: [
					//.copy("images/favicon.ico"),
					//.copy("images")
				])`
		}
		var packageSwift = `// swift-tools-version: 5.10
		import PackageDescription
	
		let package = Package(
			name: "${name}",
			platforms: [
				.macOS(.v10_15)
			],
			products: [
				.executable(name: "App", targets: ["App"])${serviceProduct}
			],
			dependencies: [
				.package(url: "https://github.com/swifweb/web", from: "1.0.0-beta.2.0.0")
			],
			targets: [
				.executableTarget(
					name: "App",
					dependencies: [
						.product(name: "Web", package: "web")
					],
					linkerSettings: [
						.unsafeFlags([
							"-DJAVASCRIPTKIT_WITHOUT_WEAKREFS",
							"-Xclang-linker",
							"-mexec-model=reactor",
							"-Xlinker", "--export-if-defined=__main_argc_argv"
						], .when(platforms: [.wasi]))
					]
				)${serviceExecutableTarget}
			]
		)
		`
		fs.writeFileSync(`${path}/Package.swift`, packageSwift)
	} catch (error) {
		webViewPanel?.webview.postMessage({ type: 'creatingFailed', data: {} })
	}
	if (await openProject(Uri.parse(path)) == false) {
		commands.executeCommand(`vscode.openFolder`, Uri.parse(path))
		window.showInformationMessage('containerExtension not found')
		commands.executeCommand(`vscode.openFolder`, Uri.parse(path))
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