import * as fs from 'fs'
import JSON5 from 'json5'
import { window } from 'vscode'
import { currentDevCrawlerPort, currentDevPort, currentProdPort, pendingNewDevCrawlerPort, pendingNewDevPort, pendingNewProdPort } from '../webStream'
import { innerWebDevPort, projectDirectory, webStream } from '../../../extension'

export async function portDevCommand() {
	const port = await window.showInputBox({
		value: `${pendingNewDevPort ? pendingNewDevPort : currentDevPort}`,
		placeHolder: 'Please select another port for debug builds',
		validateInput: text => {
			const value = parseInt(text)
			if ((pendingNewProdPort && `${value}` == pendingNewProdPort) || `${value}` == currentProdPort)
				return "Can't set same port as for release builds"
			if ((pendingNewDevCrawlerPort && `${value}` == pendingNewDevCrawlerPort) || `${value}` == currentDevCrawlerPort)
				return "Can't set same port as for crawler server"
			if (value < 80)
				return 'Should be >= 80'
			if (value > 65534)
				return 'Should be < 65535'
			return isNaN(parseInt(text)) ? 'Port should be a number' : null
		}
	})
	if (!port) return
	const innerPort = innerWebDevPort
	const portToReplace = pendingNewDevPort ? pendingNewDevPort : currentDevPort
	if (port == portToReplace) return
	const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
	var devContainerContent: string = fs.readFileSync(devContainerPath, 'utf8')
	if (devContainerContent) {
		let devContainerJson = JSON5.parse(devContainerContent)
		const valueToInsert = `${port}:${innerPort}`
		if (!devContainerJson.appPort || devContainerJson.appPort.length == 0) {
			devContainerJson.appPort = [valueToInsert]
		} else {
			const index = devContainerJson.appPort.findIndex((x) => x.includes(`:${innerPort}`))
			if (index <= -1) {
				devContainerJson.appPort.push(valueToInsert)
			} else {
				devContainerJson.appPort.splice(index, 1)
				devContainerJson.appPort.splice(index, 0, valueToInsert)
			}
		}
		fs.writeFileSync(devContainerPath, JSON.stringify(devContainerJson, null, '\t'))
		webStream?.setPendingNewDevPort(`${port}`)
	}
}