import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import JSON5 from 'json5'
import { ExtensionContext, TreeView, commands, window, workspace, env as vsEnv, extensions, TextEditor, Range } from 'vscode'
import { ExtensionState } from './enums/ExtensionState'
import { selectFolder } from './helpers/selectFolderHelper'
import { reopenInContainerCommand, whyReopenInContainerCommand } from './commands/reopenInContainer'
import { startNewProjectWizard } from './wizards/startNewProjectWizard'
import { Dependency, SidebarTreeView, SideTreeItem } from './sidebarTreeView'
import { WebStream } from './streams/web/webStream'
import { Stream } from './streams/stream'
import { DockerImage } from './dockerImage'
import { openProject } from './helpers/openProject'
import { AndroidStream } from './streams/android/androidStream'
import { EmbeddedStream } from './streams/embedded/embeddedStream'
import { PureStream } from './streams/pure/pureStream'
import { ServerStream } from './streams/server/serverStream'
import { copyFile } from './helpers/filesHelper'
import { handleIfKeybindingsEditor, keybindingsFileClosed } from './helpers/keybindingEditor'
import { EmbeddedBranch, generateAndWriteDevcontainerJson } from './devContainerConfig'

export const isArm64 = os.arch() === 'arm64'

enum SwiftVersion {
	Five = 'Swift 5',
	Six = 'Swift 6'
}
function _swiftVersionNumber(version: SwiftVersion): number {
	switch (version) {
		case SwiftVersion.Five: return 5
		case SwiftVersion.Six: return 6
	}
}
export enum ExtensionStream {
	Android = "ANDROID",
	Server = "SERVER",
	Web = "WEB",
	Embedded = "EMBEDDED",
	Pure = "PURE",
	Unknown = "UNKNOWN"
}
export enum ContextKey {
	state = 'swiftstream.state',
	isNavigationRunButtonEnabled = 'isNavigationRunButtonEnabled',
	isNavigationBuildButtonEnabled = 'isNavigationBuildButtonEnabled',
	hasCachedTargets = 'hasCachedTargets',
	isDebugging = 'isDebugging',
	isBuildingDebug = 'isBuildingDebug',
	isBuildingRelease = 'isBuildingRelease',
	isRunningDebugTarget = 'isRunningDebugTarget',
	isRunningReleaseTarget = 'isRunningReleaseTarget',
	isSwiftlangInstalled = 'isSwiftlangInstalled'
}
const _stream: string = process.env.S_MODE ?? ExtensionStream.Unknown
function stringToStream(v: string): ExtensionStream {
	return Object.values(ExtensionStream).includes(v.toUpperCase() as ExtensionStream)
		? v.toUpperCase() as ExtensionStream
		: ExtensionStream.Unknown
}
export const extensionStream: ExtensionStream = stringToStream(_stream)

export const defaultWebDevPort = 7700
export const defaultWebProdPort = 8800
export const defaultWebCrawlerPort = 9900
export const innerWebDevPort = 443
export const innerWebProdPort = 444
export const innerWebDevCrawlerPort = 3080

export const defaultServerPort = 8080
export const defaultServerNginxPort = 8200
export const innerServerPort = 8080
export const innerServerNginxPort = 80

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
	workspace.onDidChangeTextDocument(event => {
		if (event.reason) return
		const editor = window.activeTextEditor
		if (!editor || event.document !== editor.document) return
		if (!editor.document.uri.fsPath.endsWith('.swift')) return
		if (workspace.getConfiguration().get('xcode.trimEndOfLine') !== true) return
		function trimTrailingWhitespace(editor: TextEditor, lineNumber: number) {
			const line = editor.document.lineAt(lineNumber)
			const trimmed = line.text.trimEnd()
			if (trimmed.length > 0 && trimmed.length < line.text.length) {
				const range = new Range(
					line.range.end.translate(0, trimmed.length - line.text.length),
					line.range.end
				)
				editor.edit(editBuilder => editBuilder.delete(range))
			}
		}
		for (let i = 0; i < event.contentChanges.length; i++) {
			const change = event.contentChanges[i]
			if (change.text.startsWith('\n')) {
				const lineNumber = change.range.start.line
				trimTrailingWhitespace(editor, lineNumber)
			}
		}
	})
	// Checking if swift extension installed
	commands.executeCommand('setContext', ContextKey.isSwiftlangInstalled, extensions.getExtension('swiftlang.swift-vscode') !== undefined)

	registerCommands()
	
	if (!projectDirectory) {
		updateExtensionState(ExtensionState.NoProjectFolder)
		return
	}

	if (await proceedProjectDirectory(projectDirectory)) {
		await switchToTreeViewMode()
		currentStream?.registerCommands()
	}

	window.onDidChangeActiveTextEditor(async (editor) => {
		if (!editor || !isInContainer()) return
		if (await handleIfKeybindingsEditor(editor)) return
	})
	workspace.onDidCloseTextDocument(doc => {
		if (keybindingsFileClosed(doc)) return
	})

	// window.showInformationMessage(`workspace.name: ${(await workspace.findFiles('*.swift')).map((f) => f.path).join('/')}`)
}

const updateExtensionState = (state: ExtensionState) => commands.executeCommand('setContext', ContextKey.state, state)

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
	// Specific setup check for Embedded projects
	if (extensionStream === ExtensionStream.Embedded) {
		
	}
	// Classic Package.swift check for the rest
	else if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
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
	extensionContext.subscriptions.push(commands.registerCommand('SwiftStreamRun', async () => currentStream?.globalKeyRun() ))
	extensionContext.subscriptions.push(commands.registerCommand('SwiftStreamStop', async () => currentStream?.globalKeyStop() ))
	extensionContext.subscriptions.push(commands.registerCommand('SwiftStreamBuild', async () => currentStream?.globalKeyBuild() ))
	extensionContext.subscriptions.push(commands.registerCommand('SwiftStreamTest', async () => currentStream?.globalKeyTest() ))
	extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ReopenInContainer, reopenInContainerCommand))
	extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.WhyReopenInContainer, whyReopenInContainerCommand))
	extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.NewProject, startNewProjectWizard))
	extensionContext.subscriptions.push(commands.registerCommand('openProject', openProjectCommand))
	extensionContext.subscriptions.push(commands.registerCommand('startNewProjectWizard', startNewProjectWizard))
	extensionContext.subscriptions.push(commands.registerCommand('stopDebugging', async () => {
		await commands.executeCommand('workbench.action.debug.stop')
	}))
	extensionContext.subscriptions.push(commands.registerCommand('stopBuildingDebug', async () => {
		await currentStream?.abortBuildingDebug()
	}))
	extensionContext.subscriptions.push(commands.registerCommand('stopBuildingRelease', async () => {
		await currentStream?.abortBuildingRelease()
	}))
	extensionContext.subscriptions.push(commands.registerCommand('setupAlienProject', async () => {
		if (!projectDirectory) return
		if (await askProjectTypeAndCopyDevcontainerFiles(projectDirectory) == false) return
		if (isInContainer()) {
			await commands.executeCommand('remote-containers.rebuildContainer')
		} else {
			await commands.executeCommand('remote-containers.reopenInContainer')
		}
	}))
	extensionContext.subscriptions.push(commands.registerCommand('fixWrongProjectConfiguration', async () => {
		if (!projectDirectory) return
		if (await askProjectTypeAndCopyDevcontainerFiles(projectDirectory) == false) return
	}))
	extensionContext.subscriptions.push(commands.registerCommand('initializeProjectInCurrentFolder', async () => {
		if (!projectDirectory) return
		await startNewProjectWizard()
	}))
}

const detectSwiftVersion = async (projectDirectory: string): Promise<{ major: SwiftVersion, minor: number } | undefined> => {
	const packageFile = path.join(projectDirectory, 'Package.swift')
	if (!fs.existsSync(packageFile)) return undefined
	const lines = fs.readFileSync(packageFile, 'utf8').split('\n')
	if (lines.length == 0) return undefined
	let firstLine = lines[0]
	firstLine = firstLine.replaceAll(' ', '')
	const parts = firstLine.split(':')
	if (parts.length != 2) return undefined
	const versionPart = parts[1]
	const splittedVersion = versionPart.split('.')
	const minorString: string | undefined = splittedVersion.length > 0 ? splittedVersion[1] : undefined
	const minor: number | undefined = minorString ? parseInt(minorString) : undefined
	return {
		major: parts[1].startsWith('6') ? SwiftVersion.Six : SwiftVersion.Five,
		minor: minor ?? 0
	}
}

const askSwiftVersionForStream = async (stream: ExtensionStream): Promise<{ major: SwiftVersion, minor: number } | undefined> => {
	if ([ExtensionStream.Pure, ExtensionStream.Server, ExtensionStream.Web].includes(stream)) {
		const selectedItem = await window.showQuickPick(Object.values(SwiftVersion), {
			placeHolder: `Select Swift version`
		})
		if (!selectedItem) return undefined
		return { major: selectedItem as SwiftVersion, minor: 0 }
	} else {
		return { major: SwiftVersion.Six, minor: 0 }
	}
}
const askForEmbeddedBranch = async (): Promise<EmbeddedBranch | undefined> => {
	const selectedItem = await window.showQuickPick([
		{ label: 'Espressif', detail: 'ESP32-C6' },
		{ label: 'Raspberry Pi', detail: 'Pico, Pico W, Pico 2' },
		{ label: 'STMicroelectronics', detail: 'STM32F746G, NUCLEO_F103RB' },
		{ label: 'Nordic Semiconductor', detail: 'nRF52840-DK' }
	], {
		placeHolder: `Select Board Manufacturer`
	})
	if (!selectedItem) return undefined
	if (selectedItem.label === 'Espressif') {
		return EmbeddedBranch.ESP32
	} else if (selectedItem.label === 'Raspberry Pi') {
		return EmbeddedBranch.RASPBERRY
	} else if (selectedItem.label === 'STMicroelectronics') {
		return EmbeddedBranch.STM32
	} else if (selectedItem.label === 'Nordic Semiconductor') {
		return EmbeddedBranch.Zephyr
	}
	return undefined
}

const copyDevContainerFiles = async (projectDirectory: string, stream: ExtensionStream, swiftVersion: { major: SwiftVersion, minor: number }): Promise<boolean> => {
	const devcontainerFolder = path.join(projectDirectory, '.devcontainer')
	const devcontainerFilePath = path.join(devcontainerFolder, 'devcontainer.json')
	const dockerFilePath = path.join(devcontainerFolder, 'Dockerfile')
	if (!fs.existsSync(devcontainerFolder)) {
		fs.mkdirSync(devcontainerFolder)
	}
	if (fs.existsSync(devcontainerFilePath)) {
		fs.cpSync(devcontainerFilePath, `${devcontainerFilePath}.old`)
		fs.rmSync(devcontainerFilePath, { force: true })
	}
	if (fs.existsSync(dockerFilePath)) {
		fs.cpSync(dockerFilePath, `${dockerFilePath}.old`)
		fs.rmSync(dockerFilePath, { force: true })
	}
	const swiftMajorNumber = _swiftVersionNumber(swiftVersion.major)
	let options: any | undefined
	switch (stream) {
		case ExtensionStream.Embedded:
			const branch = await askForEmbeddedBranch()
			if (!branch) return false
			options['embedded'] = { branch: branch }
			break
		default: break
	}
	if (!generateAndWriteDevcontainerJson(
		devcontainerFilePath,
		stream,
		{ major: swiftMajorNumber, minor: swiftVersion.minor },
		options
	)) return false
	switch (stream) {
		case ExtensionStream.Embedded:
			await copyFile(path.join('assets', 'Devcontainer', stream.toLowerCase(), `Dockerfile-${options!.embedded!.branch}`), dockerFilePath)
			break
		case ExtensionStream.Web:
			await copyFile(path.join('assets', 'Devcontainer', stream.toLowerCase(), `Dockerfile-${swiftMajorNumber}`), dockerFilePath)
			break
		default:
			await copyFile(path.join('assets', 'Devcontainer', stream.toLowerCase(), 'Dockerfile'), dockerFilePath)
			break
	}
	return true
}

const askProjectTypeAndCopyDevcontainerFiles = async (projectDirectory: string): Promise<boolean> => {
	const items = Object.values(ExtensionStream).map((x) => {
		const v = x.toLowerCase()
		return v.charAt(0).toUpperCase() + v.slice(1)
	})
	.filter((x) => !['Android', 'Unknown'].includes(x)) // TODO: edit to enable android
	const selectedItem = await window.showQuickPick(items, {
		placeHolder: `Select type of your project`
	})
	if (!selectedItem) return false
	const swiftVersion = await detectSwiftVersion(projectDirectory) ?? await askSwiftVersionForStream(stringToStream(selectedItem))
	if (!swiftVersion) return false
	return await copyDevContainerFiles(projectDirectory, stringToStream(selectedItem), swiftVersion)
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
	commands.executeCommand('setContext', ContextKey.state, ExtensionState.ProjectMode)
	sidebarTreeView = new SidebarTreeView()
	sidebarTreeViewContainer = window.createTreeView('swiftstreamSidebar', {
		treeDataProvider: sidebarTreeView
	})
	sidebarTreeViewContainer.title = `${extensionStream}`
	sidebarTreeViewContainer.onDidCollapseElement((e) => {
		sidebarTreeView?.onDidCollapseElement(e)
	})
	sidebarTreeViewContainer.onDidExpandElement((e) => {
		sidebarTreeView?.onDidExpandElement(e)
	})
}

export function deactivate() {}