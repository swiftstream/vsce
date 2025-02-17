import * as fs from 'fs'
import { ExtensionContext, TextDocumentChangeEvent, TreeView, commands, window, workspace, env as vsEnv } from 'vscode'
import { WebberState } from './enums/WebberStateEnum'
import { selectFolder } from './helpers/selectFolderHelper'
import { startNewProjectWizard as startNewProjectWizard } from './wizards/startNewProjectWizard'
import { Dependency, SidebarTreeView } from './sidebarTreeView'
import { abortBuilding, abortBuildingRelease, Webber } from './webber'
import { DockerImage } from './dockerImage'
import { buildCommand } from './commands/build'
import { debugInChromeCommand } from './commands/debugInChrome'
import { onDidSaveTextDocument } from './commands/onDidSaveTextDocument'
import { startWebSocketServer } from './commands/webSocketServer'
import { openProject } from './helpers/openProject'

export enum ExtensionMode {
	Android = "ANDROID",
	Server = "SERVER",
	Web = "WEB"
}
const s_mode: string = process.env.S_MODE ?? "SERVER"
export const extensionMode: ExtensionMode = Object.values(ExtensionMode).includes(s_mode as ExtensionMode)
	? s_mode as ExtensionMode
	: ExtensionMode.Server
export const defaultWebDevPort = 7700
export const defaultWebProdPort = 8800
export const defaultWebCrawlerPort = 9900
export const defaultServerPort = 8080
export const innerDevPort = 443
export const innerProdPort = 444
export const innerDevCrawlerPort = 3080
export const dockerImage = new DockerImage()
export let extensionContext: ExtensionContext
export let projectDirectory: string | undefined
export let webber: Webber | undefined
export let sidebarTreeView: SidebarTreeView | undefined
export let sidebarTreeViewContainer: TreeView<Dependency> | undefined

export function isInContainer(): boolean {
	return vsEnv.remoteName?.includes('container') == true
}

export async function activate(context: ExtensionContext) {
    projectDirectory = (workspace.workspaceFolders && (workspace.workspaceFolders.length > 0))
		? workspace.workspaceFolders[0].uri.fsPath : undefined
	
	workspace.onDidSaveTextDocument(onDidSaveTextDocument)
	workspace.onDidChangeTextDocument((e: TextDocumentChangeEvent) => {
		// window.showInformationMessage(`document changed`)
	})

	// vscode.window.createTreeView("", )
	
	// Open folder name
	let folderName = workspace.name

	// Store pointer to extension context
	extensionContext = context
	
	// Monitoring project directory path
	workspace.onDidChangeWorkspaceFolders(event => {
		window.showInformationMessage('onDidChangeWorkspaceFolders')
		console.log('onDidChangeWorkspaceFolders')
		for (let i = 0; i < event.added.length; i++) {
			const added = event.added[i]
			console.dir(added)
		}
	})
	// Monitoring files rename
	workspace.onDidRenameFiles(event => {
		webber?.onDidRenameFiles(event)
	})
	workspace.onDidDeleteFiles(event => {
		webber?.onDidDeleteFiles(event)
	})

	webber = new Webber()

	registerCommands()

	////

	

	////

	if (!projectDirectory) {
		commands.executeCommand('setContext', 'swiftstream.state', WebberState.NoProjectFolder)
		return
	}

	if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
		commands.executeCommand('setContext', 'swiftstream.state', WebberState.EmptyProjectFolder)
		return
	}

	if (projectDirectory) {
		// window.showInformationMessage(`workspace.name: ${(await workspace.findFiles('*.swift')).map((f) => f.path).join('/')}`)
		await switchToProjectMode()
		startWebSocketServer()
	}
}

function registerCommands() {
	extensionContext.subscriptions.push(commands.registerCommand('openProject', openProjectCommand))
	extensionContext.subscriptions.push(commands.registerCommand('startNewProjectWizard', startNewProjectWizard))
	extensionContext.subscriptions.push(commands.registerCommand('runDebugging', debugInChromeCommand))
	extensionContext.subscriptions.push(commands.registerCommand('stopDebugging', async () => {
		await commands.executeCommand('workbench.action.debug.stop')
	}))
	extensionContext.subscriptions.push(commands.registerCommand('buildDebug', buildCommand))
	extensionContext.subscriptions.push(commands.registerCommand('stopBuildingDebug', () => {
		if (abortBuilding) abortBuilding()
	}))
	extensionContext.subscriptions.push(commands.registerCommand('stopBuildingRelease', () => {
		if (abortBuildingRelease) abortBuildingRelease()
	}))
	webber?.registercommands()
}

async function openProjectCommand() {
	const folderUri = await selectFolder('Please select folder with a project', 'Open')
	if (!folderUri) return
	await openProject(folderUri)
}

async function switchToProjectMode() {
	commands.executeCommand('setContext', 'swiftstream.state', WebberState.ProjectMode)
	// await webber.prepare(undefined)
	sidebarTreeView = new SidebarTreeView()
	sidebarTreeViewContainer = window.createTreeView('swiftstreamSidebar', {
		treeDataProvider: sidebarTreeView
	})
}

/**
 * Shows a pick list using window.showQuickPick().
 */
export async function showQuickPick() {
	let i = 0
	const result = await window.showQuickPick(['one', 'two', 'three'], {
		placeHolder: 'one, two or three',
		onDidSelectItem: item => window.showInformationMessage(`Focus ${++i}: ${item}`)
	})
	window.showInformationMessage(`Got: ${result}`)
}

/**
 * Shows an input box using window.showInputBox().
 */
export async function showInputBox() {
	const result = await window.showInputBox({
		value: 'abcdef',
		valueSelection: [2, 4],
		placeHolder: 'For example: fedcba. But not: 123',
		validateInput: text => {
			window.showInformationMessage(`Validating: ${text}`)
			return text === '123' ? 'Not 123!' : null
		}
	})
	window.showInformationMessage(`Got: ${result}`)
}

export function deactivate() {}