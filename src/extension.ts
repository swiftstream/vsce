import * as fs from 'fs'
import { ExtensionContext, TextDocumentChangeEvent, TreeView, commands, window, workspace, env as vsEnv } from 'vscode'
import { ExtensionState } from './enums/ExtensionState'
import { selectFolder } from './helpers/selectFolderHelper'
import { reopenInContainerCommand, whyReopenInContainerCommand } from "./commands/reopenInContainer"
import { startNewProjectWizard } from "./wizards/startNewProjectWizard"
import { Dependency, SidebarTreeView, SideTreeItem } from './sidebarTreeView'
import { abortBuildingRelease, WebStream } from './streams/web/webStream'
import { abortBuilding, Stream } from './streams/stream'
import { DockerImage } from './dockerImage'
import { buildCommand } from './commands/build'
import { debugInChromeCommand } from './commands/debugInChrome'
import { onDidSaveTextDocument } from './commands/onDidSaveTextDocument'
import { startWebSocketServer } from './commands/webSocketServer'
import { openProject } from './helpers/openProject'

export enum ExtensionMode {
	Android = "ANDROID",
	Server = "SERVER",
	Web = "WEB",
	Embedded = "EMBEDDED",
	Pure = "PURE"
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
export let currentStream: Stream | undefined
export let webStream: WebStream | undefined
export let sidebarTreeView: SidebarTreeView | undefined
export let sidebarTreeViewContainer: TreeView<Dependency> | undefined

export function isInContainer(): boolean {
	return vsEnv.remoteName?.includes('container') == true
}

export async function activate(context: ExtensionContext) {
    projectDirectory = (workspace.workspaceFolders && (workspace.workspaceFolders.length > 0))
		? workspace.workspaceFolders[0].uri.fsPath : undefined
	
	workspace.onDidSaveTextDocument(onDidSaveTextDocument)
	
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
		currentStream?.onDidRenameFiles(event)
	})
	workspace.onDidDeleteFiles(event => {
		currentStream?.onDidDeleteFiles(event)
	})

	switch (extensionMode) {
		case ExtensionMode.Android:
			
			break
		case ExtensionMode.Embedded:
			
			break
		case ExtensionMode.Pure:
			
			break
		case ExtensionMode.Server:
			
			break
		case ExtensionMode.Web:
			webStream = new WebStream()
			currentStream = webStream
			break
		default:
			break
	}
	
	registerCommands()

	if (!projectDirectory) {
		updateExtensionState(ExtensionState.NoProjectFolder)
		return
	}

	if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
		commands.executeCommand('setContext', 'swiftstream.state', WebberState.EmptyProjectFolder)
		return
	}

	if (projectDirectory) {
		// window.showInformationMessage(`workspace.name: ${(await workspace.findFiles('*.swift')).map((f) => f.path).join('/')}`)
		startWebSocketServer()
		await switchToTreeViewMode()

const updateExtensionState = (state: ExtensionState) => commands.executeCommand('setContext', 'swiftstream.state', state)
	}
}

function registerCommands() {
	extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ReopenInContainer, reopenInContainerCommand))
	extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.WhyReopenInContainer, whyReopenInContainerCommand))
	extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewProject, startNewProjectWizard))
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
	currentStream?.registerCommands()
}

async function openProjectCommand() {
	const folderUri = await selectFolder('Please select folder with a project', 'Open')
	if (!folderUri) return
	await openProject(folderUri)
}

async function switchToTreeViewMode() {
	commands.executeCommand('setContext', 'swiftstream.state', WebberState.ProjectMode)
	// await webStream.prepare(undefined)
	sidebarTreeView = new SidebarTreeView()
	sidebarTreeViewContainer = window.createTreeView('swiftstreamSidebar', {
		treeDataProvider: sidebarTreeView
	})
}

export function deactivate() {}