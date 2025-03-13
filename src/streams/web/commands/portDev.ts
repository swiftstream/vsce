import { window } from 'vscode'
import { currentDevCrawlerPort, currentDevPort, currentProdPort, pendingNewDevCrawlerPort, pendingNewDevPort, pendingNewProdPort } from '../webStream'
import { innerWebDevPort, webStream } from '../../../extension'
import { DevContainerConfig } from '../../../devContainerConfig'

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
	const portToReplace = pendingNewDevPort ? pendingNewDevPort : currentDevPort
	if (port == portToReplace) return
	DevContainerConfig.transaction((c) => c.addOrChangePort(port, `${innerWebDevPort}`))
	webStream?.setPendingNewDevPort(port)
}