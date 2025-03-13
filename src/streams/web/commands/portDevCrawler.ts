import { window } from 'vscode'
import { currentDevCrawlerPort, currentDevPort, currentProdPort, pendingNewDevCrawlerPort, pendingNewDevPort, pendingNewProdPort } from '../webStream'
import { innerWebDevCrawlerPort, webStream } from '../../../extension'
import { DevContainerConfig } from '../../../devContainerConfig'

export async function portDevCrawlerCommand() {
    const port = await window.showInputBox({
        value: `${pendingNewDevCrawlerPort ? pendingNewDevCrawlerPort : currentDevCrawlerPort}`,
        placeHolder: 'Please select another port for debug builds',
        validateInput: text => {
            const value = parseInt(text)
            if ((pendingNewDevPort && `${value}` == pendingNewDevPort) || `${value}` == currentDevPort)
                return "Can't set same port as for development builds"
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
    const portToReplace = pendingNewDevCrawlerPort ? pendingNewDevCrawlerPort : currentDevCrawlerPort
    if (port == portToReplace) return
    DevContainerConfig.transaction((c) => c.addOrChangePort(port, `${innerWebDevCrawlerPort}`))
    webStream?.setPendingNewDevCrawlerPort(port)
}