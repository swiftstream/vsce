import { ExtensionContext, TextDocument, TextDocumentChangeEvent, TreeView, commands, window, workspace, env as vsEnv } from 'vscode'
import { WebberState } from './enums/WebberStateEnum'
import * as fs from 'fs'
import { selectFolder } from './helpers/selectFolderHelper'
import { startNewProjectWizard as startNewProjectWizard } from './wizards/startNewProjectWizard'
import { Dependency, SidebarTreeView } from './sidebarTreeView'
import { currentDevPort, currentProdPort, setPendingNewDevPort, setPendingNewProdPort, Webber } from './webber'
import { readPortsFromDevContainer } from './helpers/readPortsFromDevContainer'

export const defaultDevPort = 7770
export const defaultProdPort = 8880
export let extensionContext: ExtensionContext
export let projectDirectory: string | undefined
export let webber: Webber | undefined
export let sidebarTreeView: SidebarTreeView | undefined
 
export function isInContainer(): boolean {
	return vsEnv.remoteName?.includes('container') == true
}

export async function activate(context: ExtensionContext) {
    projectDirectory = (workspace.workspaceFolders && (workspace.workspaceFolders.length > 0))
		? workspace.workspaceFolders[0].uri.fsPath : undefined
	
	const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
	workspace.onDidSaveTextDocument(async (document: TextDocument) => {
		if (document.languageId === "swift" && document.uri.scheme === "file") {
			
		} else if (document.languageId === "jsonc" && document.uri.scheme === "file") {
			if (document.uri.path == devContainerPath) {
				const readPorts = await readPortsFromDevContainer()
				if (readPorts.devPortPresent && `${readPorts.devPort}` != currentDevPort) {
					setPendingNewDevPort(`${readPorts.devPort}`)
				} else {
					setPendingNewDevPort(undefined)
				}
				if (readPorts.prodPortPresent && `${readPorts.prodPort}` != currentProdPort) {
					setPendingNewProdPort(`${readPorts.prodPort}`)
				} else {
					setPendingNewProdPort(undefined)
				}
			}
		}
	})
	workspace.onDidChangeTextDocument((e: TextDocumentChangeEvent) => {
		// window.showInformationMessage(`document changed`)
	})

	// vscode.window.createTreeView("", )
	
	// Open folder name
	let folderName = workspace.name

	// Store pointer to extension context
	extensionContext = context
	
	// Monitoring project directory path
	workspace.onDidChangeWorkspaceFolders(event => { // TODO: track project directory change
		window.showInformationMessage('onDidChangeWorkspaceFolders')
		console.log('onDidChangeWorkspaceFolders')
		for (let i = 0; i < event.added.length; i++) {
			const added = event.added[i]
			console.dir(added)
		}
	})

	webber = new Webber()

	registerCommands()

	////

	

	////

	if (!projectDirectory) {
		commands.executeCommand('setContext', 'webber.state', WebberState.NoProjectFolder)
		return
	}

	if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
		commands.executeCommand('setContext', 'webber.state', WebberState.EmptyProjectFolder)
		return
	}

	if (projectDirectory) {
		window.showInformationMessage(`workspace.name: ${(await workspace.findFiles('*.swift')).map((f) => f.path).join('/')}`)
		await switchToProjectMode()


	}
}

function registerCommands() {
	extensionContext.subscriptions.push(commands.registerCommand('startNewProjectWizard', startNewProjectWizard))
	extensionContext.subscriptions.push(commands.registerCommand('openProject', openProjectCommand))
	webber?.registercommands()
}

async function openProjectCommand() {
	const folderUri = await selectFolder('Please select folder with a project', 'Open')
	commands.executeCommand('remote-containers.openFolder', folderUri)
	commands.executeCommand('remote-containers.revealLogTerminal')
}

async function switchToProjectMode() {
	commands.executeCommand('setContext', 'webber.state', WebberState.ProjectMode)
	// await webber.prepare(undefined)
	sidebarTreeView = new SidebarTreeView()
	let tv: TreeView<Dependency> = window.createTreeView('webberSidebar', {
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