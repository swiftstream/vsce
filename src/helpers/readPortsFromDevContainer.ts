import * as fs from 'fs'
import JSON5 from 'json5'
import { innerServerNginxPort, innerServerPort, innerWebDevCrawlerPort, innerWebDevPort, innerWebProdPort, projectDirectory } from '../extension'

function extractPort(appPorts: string[], port: string): number | undefined {
    var appPortsString = ''
    const index = appPorts.findIndex((x) => x.endsWith(`:${port}`))
    if (index <= -1)
        return undefined
    appPortsString = appPorts[index]
    const appPort: number = +appPortsString.split(':')[0]
    return appPort
}

export function readWebPortsFromDevContainer(): {
    devPort: number | undefined,
    devCrawlerPort: number | undefined,
    prodPort: number | undefined,
    devPortPresent: boolean,
    devCrawlerPortPresent: boolean,
    prodPortPresent: boolean
} {
    const devcontainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
	const devcontainerContent = fs.readFileSync(devcontainerPath)
	const devcontainerConfig = JSON5.parse(devcontainerContent.toString())
    const appPorts: string[] = devcontainerConfig.appPort
    if (appPorts.length == 0)
        return {
            devPort: undefined, devCrawlerPort: undefined, prodPort: undefined,
            devPortPresent: false, devCrawlerPortPresent: false, prodPortPresent: false
        }
    return {
        devPort: extractPort(appPorts, `${innerWebDevPort}`),
        devCrawlerPort: extractPort(appPorts, `${innerWebDevCrawlerPort}`),
        prodPort: extractPort(appPorts, `${innerWebProdPort}`),
        devPortPresent: appPorts.findIndex((x) => x.endsWith(`:${innerWebDevPort}`)) >= 0,
        devCrawlerPortPresent: appPorts.findIndex((x) => x.endsWith(`:${innerWebDevCrawlerPort}`)) >= 0,
        prodPortPresent: appPorts.findIndex((x) => x.endsWith(`:${innerWebProdPort}`)) >= 0
    }
}

export function readServerPortsFromDevContainer(): {
    port: number | undefined,
    nginxPort: number | undefined,
    portPresent: boolean,
    nginxPortPresent: boolean
} {
    const devcontainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
	const devcontainerContent = fs.readFileSync(devcontainerPath)
	const devcontainerConfig = JSON5.parse(devcontainerContent.toString())
    const appPorts: string[] = devcontainerConfig.appPort
    if (appPorts.length == 0)
        return {
            port: undefined,
            nginxPort: undefined,
            portPresent: false,
            nginxPortPresent: false
        }
    return {
        port: extractPort(appPorts, `${innerServerPort}`),
        nginxPort: extractPort(appPorts, `${innerServerNginxPort}`),
        portPresent: appPorts.findIndex((x) => x.endsWith(`:${innerServerPort}`)) >= 0,
        nginxPortPresent: appPorts.findIndex((x) => x.endsWith(`:${innerServerNginxPort}`)) >= 0,
    }
}