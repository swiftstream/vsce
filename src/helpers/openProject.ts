import { commands, extensions, Uri, WebviewPanel, window } from "vscode"

async function openProjectInContainer(folderUri: Uri, webViewPanel: WebviewPanel | undefined): Promise<boolean> {
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

export async function openProject(folderUri: Uri, webViewPanel?: WebviewPanel) {
	if (await openProjectInContainer(folderUri, webViewPanel) == false) {
        commands.executeCommand(`vscode.openFolder`, folderUri)
    }
}