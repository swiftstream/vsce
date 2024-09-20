import * as fs from 'fs'
import { window } from "vscode"
import { currentDevPort, currentProdPort, pendingNewDevPort, pendingNewProdPort, setPendingNewDevPort } from "../webber"
import { projectDirectory } from "../extension"
import { openDocumentInEditor } from "../helpers/openDocumentInEditor"

export async function portDevCommand() {
	const port = await window.showInputBox({
		value: `${pendingNewDevPort ? pendingNewDevPort : currentDevPort}`,
		placeHolder: 'Please select another port for debug builds',
		validateInput: text => {
			const value = parseInt(text)
			if ((pendingNewProdPort && `${value}` == pendingNewProdPort) || `${value}` == currentProdPort)
				return "Can't set same port as for release builds"
			if (value < 80)
				return 'Should be >= 80'
			if (value > 65534)
				return 'Should be < 65535'
			return isNaN(parseInt(text)) ? 'Port should be a number' : null
		}
	})
	if (!port) return
	const devPortToReplace = pendingNewDevPort ? pendingNewDevPort : currentDevPort
	const prodPortToReplace = pendingNewProdPort ? pendingNewProdPort : currentProdPort
	if (port == devPortToReplace) return
	const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
	var devContainerContent: string = fs.readFileSync(devContainerPath, 'utf8')
	if (devContainerContent) {
		const stringToReplace = `"appPort": ["${devPortToReplace}:443", "${prodPortToReplace}:444"],`
		if (!devContainerContent.includes(stringToReplace)) {
			const res = await window.showErrorMessage(`Port doesn't match in devcontainer.json`, 'Edit manually', 'Cancel')
			if (res == 'Edit manually')
				await openDocumentInEditor(devContainerPath, `"appPort"`)
			return
		}
		devContainerContent = devContainerContent.replace(stringToReplace, `"appPort": ["${port}:443", "${prodPortToReplace}:444"],`)
		fs.writeFileSync(devContainerPath, devContainerContent)
		setPendingNewDevPort(`${port}`)
	}
}