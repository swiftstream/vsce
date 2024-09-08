import { workspace } from "vscode"
import { currentPort } from "../webber"

export function createDebugConfigIfNeeded(): any {
    var configurations = workspace.getConfiguration('launch').get<any[]>('configurations')
	var debugConfig: any | undefined
	if (configurations)
		for (var config of configurations) {
			if (config.type === 'chrome')
				// Return existing configuration
                return debugConfig
		}
	else
		configurations = []
	// Add a new configuration
    const newConfig: any = {
        type: 'chrome',
        request: 'launch',
        name: 'Debug in Chrome',
        url: `https://localhost:${currentPort}`,
        includeLaunchArgs: true,
        runtimeArgs: [
            '--args',
            '--test-type',
            '--user-data-dir=/tmp',
            '--ignore-certificate-errors',
            `--unsafely-treat-insecure-origin-as-secure=https://localhost:${currentPort}`
        ]
    }
    configurations = [newConfig, ...configurations]
    config.update('configurations', configurations, true)
    console.log('Launch configuration added')
    return newConfig
}