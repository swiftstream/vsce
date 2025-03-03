import { OpenDialogOptions, window } from 'vscode'

export async function selectFolder(title: string, button: string) {
	const options: OpenDialogOptions = {
		canSelectFolders: true,
		canSelectFiles: false,
		openLabel: button,
		title: title
	}
	const folderUris = await window.showOpenDialog(options)
	if (folderUris && folderUris.length > 0){
		return folderUris[0]
	}
	return undefined
}