import { Uri, workspace } from "vscode"
import { innerDevCrawlerPort, innerDevPort, innerProdPort, projectDirectory } from "../extension"
import JSON5 from 'json5'

export async function readPortsFromDevContainer(): Promise<{
    devPort: number | undefined,
    devCrawlerPort: number | undefined,
    prodPort: number | undefined,
    devPortPresent: boolean,
    devCrawlerPortPresent: boolean,
    prodPortPresent: boolean
}> {
    const devcontainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
	const devcontainerContent = await workspace.fs.readFile(Uri.file(devcontainerPath))
	const devcontainerConfig = JSON5.parse(devcontainerContent.toString())
    const appPorts: string[] = devcontainerConfig.appPort
    if (appPorts.length == 0)
        return {
            devPort: undefined, devCrawlerPort: undefined, prodPort: undefined,
            devPortPresent: false, devCrawlerPortPresent: false, prodPortPresent: false
        }
    function extractPort(port: string): number | undefined {
        var appPortsString = ''
        const index = appPorts.findIndex((x) => x.endsWith(`:${port}`))
        if (index <= -1)
            return undefined
        appPortsString = appPorts[index]
        const appPort: number = +appPortsString.split(':')[0]
        return appPort
    }
    return {
        devPort: extractPort(`${innerDevPort}`),
        devCrawlerPort: extractPort(`${innerDevCrawlerPort}`),
        prodPort: extractPort(`${innerProdPort}`),
        devPortPresent: appPorts.find((x) => x === `${innerDevPort}`) != undefined,
        devCrawlerPortPresent: appPorts.find((x) => x === `${innerDevCrawlerPort}`) != undefined,
        prodPortPresent: appPorts.find((x) => x === `${innerProdPort}`) != undefined
    }
}