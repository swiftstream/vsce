import * as fs from 'fs'
import * as path from 'path'
import JSON5 from 'json5'
import { ExtensionContext, TreeView, commands, window, workspace, env as vsEnv } from 'vscode'
import { ExtensionState } from './enums/ExtensionState'
import { selectFolder } from './helpers/selectFolderHelper'
import { reopenInContainerCommand, whyReopenInContainerCommand } from './commands/reopenInContainer'
import { startNewProjectWizard } from './wizards/startNewProjectWizard'
import { Dependency, SidebarTreeView, SideTreeItem } from './sidebarTreeView'
import { abortBuildingRelease, WebStream } from './streams/web/webStream'
import { abortBuilding, Stream } from './streams/stream'
import { DockerImage } from './dockerImage'
import { buildCommand } from './streams/web/commands/build'
import { debugInChromeCommand } from './streams/web/commands/debugInChrome'
import { openProject } from './helpers/openProject'
import { AndroidStream } from './streams/android/androidStream'
import { EmbeddedStream } from './streams/embedded/embeddedStream'
import { PureStream } from './streams/pure/pureStream'
import { ServerStream } from './streams/server/serverStream'
import { copyFile } from './helpers/filesHelper'

enum SwiftVersion {
	Five = 'Swift 5',
	Six = 'Swift 6'
}
export enum ExtensionStream {
	Android = "ANDROID",
	Server = "SERVER",
	Web = "WEB",
	Embedded = "EMBEDDED",
	Pure = "PURE",
	Unknown = "UNKNOWN"
}
const _stream: string = process.env.S_MODE ?? ExtensionStream.Unknown
export const extensionStream: ExtensionStream = Object.values(ExtensionStream).includes(_stream as ExtensionStream)
	? _stream as ExtensionStream
	: ExtensionStream.Unknown
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
export let androidStream: AndroidStream | undefined
export let embeddedStream: EmbeddedStream | undefined
export let pureStream: PureStream | undefined
export let serverStream: ServerStream | undefined
export let webStream: WebStream | undefined
export let sidebarTreeView: SidebarTreeView | undefined
export let sidebarTreeViewContainer: TreeView<Dependency> | undefined

export function isInContainer(): boolean {
	return vsEnv.remoteName?.includes('container') == true
}

export async function activate(context: ExtensionContext) {
    projectDirectory = (workspace.workspaceFolders && (workspace.workspaceFolders.length > 0))
		? workspace.workspaceFolders[0].uri.fsPath : undefined
	
	workspace.onDidSaveTextDocument((document) => {
		currentStream?.onDidSaveTextDocument(document)
	})

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

	registerCommands()

	if (!projectDirectory) {
		updateExtensionState(ExtensionState.NoProjectFolder)
		return
	}

	if (await proceedProjectDirectory(projectDirectory)) {
		await switchToTreeViewMode()
		currentStream?.registerCommands()
	}

	// window.showInformationMessage(`workspace.name: ${(await workspace.findFiles('*.swift')).map((f) => f.path).join('/')}`)
}

const updateExtensionState = (state: ExtensionState) => commands.executeCommand('setContext', 'swiftstream.state', state)

const proceedProjectDirectory = async (projectDirectory: string): Promise<boolean> => {
	if (!isInContainer()) {
		const devcontainerFolder = path.join(projectDirectory, '.devcontainer')
		const devcontainerFile = path.join(devcontainerFolder, 'devcontainer.json')
		if (fs.existsSync(devcontainerFile)) {
			const stringData = fs.readFileSync(devcontainerFile, 'utf8')
			const json = JSON5.parse(stringData)
			if (isConfigValid(json)) {
				switchToTreeViewMode()
			} else {
				updateExtensionState(ExtensionState.WrongProjectConfiguration)
			}
		} else {
			updateExtensionState(ExtensionState.MissingProjectConfiguration)
		}
		return false
	}
	if (extensionStream === ExtensionStream.Unknown) {
		const devcontainerFolder = path.join(projectDirectory, '.devcontainer')
		const devcontainerFile = path.join(devcontainerFolder, 'devcontainer.json')
		if (fs.existsSync(devcontainerFile)) {
			updateExtensionState(ExtensionState.WrongProjectConfiguration)
		} else {
			updateExtensionState(ExtensionState.MissingProjectConfiguration)
		}
		return false
	}
	if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
		updateExtensionState(ExtensionState.MissingSwiftPackage)
		return false
	}
	switch (extensionStream) {
		case ExtensionStream.Android:
			return await activateAndroidStream()
		case ExtensionStream.Embedded:
			return await activateEmbeddedStream()
		case ExtensionStream.Pure:
			return await activatePureStream()
		case ExtensionStream.Server:
			return await activateServerStream()
		case ExtensionStream.Web:
			return await activateWebStream()
		default:
			return false
	}
}

const activateAndroidStream = async (): Promise<boolean> => {
	androidStream = new AndroidStream()
	currentStream = androidStream
	return true
}

const activateEmbeddedStream = async (): Promise<boolean> => {
	embeddedStream = new EmbeddedStream()
	currentStream = embeddedStream
	return true
}

const activatePureStream = async (): Promise<boolean> => {
	pureStream = new PureStream()
	currentStream = pureStream
	return true
}

const activateServerStream = async (): Promise<boolean> => {
	serverStream = new ServerStream()
	currentStream = serverStream
	return true
}

const activateWebStream = async (): Promise<boolean> => {
	webStream = new WebStream()
	currentStream = webStream
	return true
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
	extensionContext.subscriptions.push(commands.registerCommand('setupAlienProject', async () => {
		if (!projectDirectory) return
		await askProjectTypeAndCopyDevcontainerFiles(projectDirectory)
		if (isInContainer()) {
			await commands.executeCommand('remote-containers.rebuildContainer')
		} else {
			await commands.executeCommand('remote-containers.reopenInContainer')
		}
	}))
	extensionContext.subscriptions.push(commands.registerCommand('fixWrongProjectConfiguration', async () => {
		if (!projectDirectory) return
		await askProjectTypeAndCopyDevcontainerFiles(projectDirectory)
	}))
	extensionContext.subscriptions.push(commands.registerCommand('initializeProjectInCurrentFolder', async () => {
		if (!projectDirectory) return
		await startNewProjectWizard()
	}))
}

const detectSwiftVersion = async (projectDirectory: string): Promise<SwiftVersion | undefined> => {
	const packageFile = path.join(projectDirectory, 'Package.swift')
	if (!fs.existsSync(packageFile)) return undefined
	const lines = fs.readFileSync(packageFile, 'utf8').split('\n')
	if (lines.length == 0) return undefined
	let firstLine = lines[0]
	firstLine = firstLine.replaceAll(' ', '')
	const parts = firstLine.split(':')
	if (parts.length != 2) return undefined
	return parts[1].startsWith('6') ? SwiftVersion.Six : SwiftVersion.Five
}

const askSwiftVersionForStream = async (stream: ExtensionStream): Promise<SwiftVersion | undefined> => {
	if ([ExtensionStream.Pure, ExtensionStream.Server, ExtensionStream.Web].includes(stream)) {
		const selectedItem = await window.showQuickPick(Object.values(SwiftVersion), {
			placeHolder: `Select Swift version`
		})
		if (!selectedItem) return undefined
		return selectedItem as SwiftVersion
	} else {
		return SwiftVersion.Six
	}
}

const copyDevContainerFiles = async (projectDirectory: string, stream: ExtensionStream, swiftVersion: SwiftVersion) => {
	const devcontainerFolder = path.join(projectDirectory, '.devcontainer')
	const devcontainerFile = path.join(devcontainerFolder, 'devcontainer.json')
	const dockerFile = path.join(devcontainerFolder, 'Dockerfile')
	if (!fs.existsSync(devcontainerFolder)) {
		fs.mkdirSync(devcontainerFolder)
	}
	if (fs.existsSync(devcontainerFile)) {
		fs.cpSync(devcontainerFile, `${devcontainerFile}.old`)
		fs.rmSync(devcontainerFile, { force: true })
	}
	if (fs.existsSync(dockerFile)) {
		fs.cpSync(dockerFile, `${dockerFile}.old`)
		fs.rmSync(dockerFile, { force: true })
	}
	const swiftVersionNumber = swiftVersion == SwiftVersion.Six ? '6' : '5'
	await copyFile(path.join('assets', 'Devcontainer', stream.toLowerCase(), `devcontainer${swiftVersionNumber}.json`), devcontainerFile)
	await copyFile(path.join('assets', 'Devcontainer', stream.toLowerCase(), 'Dockerfile'), dockerFile)
}

const askProjectTypeAndCopyDevcontainerFiles = async (projectDirectory: string) => {
	const items = Object.values(ExtensionStream).map((x) => {
		const v = x.toLowerCase()
		return v.charAt(0).toUpperCase() + v.slice(1)
	})
	.filter((x) => !['Android', 'Embedded', 'Unknown'].includes(x)) // TODO: edit to enable android and embedded
	const selectedItem = await window.showQuickPick(items, {
		placeHolder: `Select type of your project`
	})
	if (!selectedItem) return
	const swiftVersion = await detectSwiftVersion(projectDirectory) ?? await askSwiftVersionForStream(selectedItem as ExtensionStream)
	if (!swiftVersion) return
	return await copyDevContainerFiles(projectDirectory, selectedItem as ExtensionStream, swiftVersion)
}

async function openProjectCommand() {
	const folderUri = await selectFolder('Please select folder with a project', 'Open')
	if (!folderUri) return
	const devcontainerFile = path.join(folderUri.path, '.devcontainer', 'devcontainer.json')
	if (fs.existsSync(devcontainerFile)) {
		const stringData = fs.readFileSync(devcontainerFile, 'utf8')
		const json = JSON5.parse(stringData)
		if (isConfigValid(json)) {
			await openProject(folderUri)
		} else {
			commands.executeCommand(`vscode.openFolder`, folderUri)
		}
	} else {
		commands.executeCommand(`vscode.openFolder`, folderUri)
	}
}

const isConfigValid = (config: any): boolean => {
	return (
		config.containerEnv
		&& config.containerEnv.S_MODE
		&& Object.values(ExtensionStream).includes(config.containerEnv.S_MODE as ExtensionStream)
		&& (config.containerEnv.S_MODE as ExtensionStream) != ExtensionStream.Unknown
	)
}

async function switchToTreeViewMode() {
	commands.executeCommand('setContext', 'swiftstream.state', ExtensionState.ProjectMode)
	sidebarTreeView = new SidebarTreeView()
	sidebarTreeViewContainer = window.createTreeView('swiftstreamSidebar', {
		treeDataProvider: sidebarTreeView
	})
}

export function deactivate() {}