import { Uri, workspace } from "vscode"
import { projectDirectory } from "../extension"
import JSON5 from 'json5'

export async function readPortFromDevContainer(): Promise<number | undefined> {
    const devcontainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
	const devcontainerContent = await workspace.fs.readFile(Uri.file(devcontainerPath))
	const devcontainerConfig = JSON5.parse(devcontainerContent.toString())
    const appPorts: string[] = devcontainerConfig.appPort
    if (appPorts.length == 0)
        return undefined
    const appPortsString: string = appPorts[0]
    const appPort: number = +appPortsString.split(':')[0]
    return appPort
}