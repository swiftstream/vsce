import { Uri, workspace } from 'vscode'
import { innerWebDevCrawlerPort, innerWebDevPort, innerWebProdPort, projectDirectory } from '../extension'
import JSON5 from 'json5'

export async function readWebPortsFromDevContainer(): Promise<{
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
        devPort: extractPort(`${innerWebDevPort}`),
        devCrawlerPort: extractPort(`${innerWebDevCrawlerPort}`),
        prodPort: extractPort(`${innerWebProdPort}`),
        devPortPresent: appPorts.findIndex((x) => x.endsWith(`:${innerWebDevPort}`)) >= 0,
        devCrawlerPortPresent: appPorts.findIndex((x) => x.endsWith(`:${innerWebDevCrawlerPort}`)) >= 0,
        prodPortPresent: appPorts.findIndex((x) => x.endsWith(`:${innerWebProdPort}`)) >= 0
    }
}