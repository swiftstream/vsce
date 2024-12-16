import { commands, extensions, env, Uri, window } from "vscode"
import { projectDirectory } from "../extension"

export async function whyReopenInContainerCommand() {
	window.showInformationMessage('Swift Stream requires projects to be opened inside a Docker container to ensure a consistent, isolated, and platform-independent environment for Swift development.')
}

export async function reopenInContainerCommand() {
	if (!projectDirectory) {
		window.showInformationMessage('Please open project folder first')
		return
	}
	const folderUri: Uri = Uri.parse(projectDirectory)
	const extension = extensions.getExtension('ms-vscode-remote.remote-containers')
    if (!extension) {
		const res = await window.showInformationMessage(`You have to install Dev Containers extension first`, 'Install', 'Cancel')
		if (res == 'Install') {
			env.openExternal(Uri.parse('vscode:extension/ms-vscode-remote.remote-containers'))
		}
		return
	}
	try {
		if (!extension.isActive) { await extension.activate() }
		commands.executeCommand('remote-containers.openFolder', folderUri)
		commands.executeCommand('remote-containers.revealLogTerminal')
	} catch (error: any) {
		window.showErrorMessage(`Unexpected error has occured: ${error.toString()}`)
	}
}