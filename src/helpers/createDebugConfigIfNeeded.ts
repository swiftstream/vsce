import * as fs from 'fs'
import JSON5 from 'json5'
import { Uri, workspace } from "vscode"
import { currentDevPort } from "../webber"
import { projectDirectory } from "../extension"

export async function createDebugConfigIfNeeded(): Promise<any> {
    var configurations = workspace.getConfiguration('launch').get<any[]>('configurations')
	if (configurations)
		for (var config of configurations) {
			if (config.type === 'chrome' && config.url.includes(`:${currentDevPort}`)) {
    			// Return existing configuration
                return config
            }
		}
    // Add a new configuration
    const newConfig: any = {
        type: 'chrome',
        request: 'launch',
        name: 'Debug in Chrome',
        url: `https://localhost:${currentDevPort}`,
        includeLaunchArgs: true,
        runtimeArgs: [
            '--args',
            '--test-type',
            '--user-data-dir=/tmp',
            '--ignore-certificate-errors',
            `--unsafely-treat-insecure-origin-as-secure=https://localhost:${currentDevPort}`
        ],
        outFiles: [
            '${workspaceFolder}/BuildDev/*.js'
        ],
        skipFiles: [
            '${workspaceFolder}/Sources/**',
            '${workspaceFolder}/.build/**',
            '**/node_modules/**',
            '**/BuildProd/**',
            '**/WebSources/**'
        ]
    }
    const vscodePath = `${projectDirectory}/.vscode`
    const launchPath = `${vscodePath}/launch.json`
    if (!fs.existsSync(vscodePath)) {
        fs.mkdirSync(vscodePath)
    }
    if (!fs.existsSync(launchPath)) {
        var newLaunchContent = {
            version: '0.2.0',
            configurations: [newConfig]
        }
        fs.writeFileSync(launchPath, JSON.stringify(newLaunchContent, null, '\t'))
        return newConfig
    }
    const launchContent = await workspace.fs.readFile(Uri.file(launchPath))
    const launchParsed = JSON5.parse(launchContent.toString())
    const existingConfigurations: any[] = launchParsed.configurations
	var newLaunchContent = {
        version: '0.2.0',
        configurations: [newConfig, ...existingConfigurations]
    }
    fs.writeFileSync(launchPath, JSON.stringify(newLaunchContent, null, '\t'))
    return newConfig
}