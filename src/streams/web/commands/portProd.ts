import { window } from 'vscode'
import { currentDevCrawlerPort, currentDevPort, currentProdPort, pendingNewDevCrawlerPort, pendingNewDevPort, pendingNewProdPort } from '../webStream'
import { innerWebProdPort, webStream } from '../../../extension'
import { DevContainerConfig } from '../../../devContainerConfig'

export async function portProdCommand() {
	const port = await window.showInputBox({
		value: `${pendingNewProdPort ? pendingNewProdPort : currentProdPort}`,
		placeHolder: 'Please select another port for release builds',
		validateInput: text => {
			const value = parseInt(text)
			if ((pendingNewDevPort && `${value}` == pendingNewDevPort) || `${value}` == currentDevPort)
				return "Can't set same port as for debug builds"
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
	const portToReplace = pendingNewProdPort ? pendingNewProdPort : currentProdPort
	if (port == portToReplace) return
	DevContainerConfig.transaction((c) => c.addOrChangePort(port, `${innerWebProdPort}`))
	webStream?.setPendingNewProdPort(port)
}