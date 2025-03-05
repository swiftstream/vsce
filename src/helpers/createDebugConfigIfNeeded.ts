import * as fs from 'fs'
import path from 'path'
import JSON5 from 'json5'
import { Uri, workspace } from 'vscode'
import { currentDevPort } from '../streams/web/webStream'
import { projectDirectory } from '../extension'

export async function createWebDebugConfigIfNeeded(): Promise<any> {
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
            '${workspaceFolder:' + `${path.basename(projectDirectory ?? '')}` + '}/DevPublic/*.js'
        ],
        skipFiles: [
            '${workspaceFolder:' + `${path.basename(projectDirectory ?? '')}` + '}/Sources/**',
            '${workspaceFolder:' + `${path.basename(projectDirectory ?? '')}` + '}/.build/**',
            '**/node_modules/**',
            '**/DistPublic/**',
            '**/WebSources/**'
        ]
    }
    return await readAndUpdateConfig((config) => {
        if (!config.configurations) {
            config.configurations = [newConfig]
        } else {
            const existingConfigurations: any[] = config.configurations
            config.configurations = [newConfig, ...existingConfigurations]
        }
        return config
    })
}

// MARK: Helpers

async function readAndUpdateConfig(callback: (any) => any): Promise<any> {
    const vscodePath = `${projectDirectory}/.vscode`
    const launchPath = `${vscodePath}/launch.json`
    if (!fs.existsSync(vscodePath)) {
        fs.mkdirSync(vscodePath)
    }
    if (!fs.existsSync(launchPath)) {
        var newLaunchContent = {
            version: '0.2.0',
            configurations: []
        }
        newLaunchContent = callback(newLaunchContent)
        fs.writeFileSync(launchPath, JSON.stringify(newLaunchContent, null, '\t'))
        return newLaunchContent
    }
    const launchContent = await workspace.fs.readFile(Uri.file(launchPath))
    var launchParsed = JSON5.parse(launchContent.toString())
    launchParsed = callback(launchParsed)
    fs.writeFileSync(launchPath, JSON.stringify(launchParsed, null, '\t'))
    return launchParsed
}