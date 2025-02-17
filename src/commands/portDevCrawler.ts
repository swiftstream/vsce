import * as fs from 'fs'
import JSON5 from 'json5'
import { window } from "vscode"
import { currentDevCrawlerPort, currentDevPort, currentProdPort, pendingNewDevCrawlerPort, pendingNewDevPort, pendingNewProdPort, setPendingNewDevCrawlerPort } from "../webber"
import { innerDevCrawlerPort, projectDirectory } from "../extension"

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
    const innerPort = innerDevCrawlerPort
    const portToReplace = pendingNewDevCrawlerPort ? pendingNewDevCrawlerPort : currentDevCrawlerPort
    if (port == portToReplace) return
    const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
    var devContainerContent: string = fs.readFileSync(devContainerPath, 'utf8')
    if (devContainerContent) {
        let devContainerJson = JSON5.parse(devContainerContent)
        const valueToInsert = `${port}:${innerPort}`
        if (!devContainerJson.appPort) {
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
        setPendingNewDevCrawlerPort(`${port}`)
    }
}