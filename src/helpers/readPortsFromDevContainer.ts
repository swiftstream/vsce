import { Uri, workspace } from "vscode"
import { projectDirectory } from "../extension"
import JSON5 from 'json5'

export async function readPortsFromDevContainer(): Promise<{
    devPort: number | undefined,
    prodPort: number | undefined,
    devPortPresent: boolean,
    prodPortPresent: boolean
}> {
    const devcontainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
	const devcontainerContent = await workspace.fs.readFile(Uri.file(devcontainerPath))
	const devcontainerConfig = JSON5.parse(devcontainerContent.toString())
    const appPorts: string[] = devcontainerConfig.appPort
    if (appPorts.length == 0)
        return {
            devPort: undefined, prodPort: undefined,
            devPortPresent: false, prodPortPresent: false
        }
    function extractPort(prod: boolean): number | undefined {
        var appPortsString = ''
        if (!prod) {
            if (appPorts.length < 1)
                return undefined
            appPortsString = appPorts[0]
        } else {
            if (appPorts.length < 2)
                return undefined
            appPortsString = appPorts[1]
        }
        const appPort: number = +appPortsString.split(':')[0]
        return appPort
    }
    return {
        devPort: extractPort(false),
        prodPort: extractPort(true),
        devPortPresent: appPorts.length >= 1,
        prodPortPresent: appPorts.length > 1
    }
}