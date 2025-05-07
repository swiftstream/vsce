import * as fs from 'fs'
import JSON5 from 'json5'
import { ExtensionStream, projectDirectory } from './extension'
import { findTheRightToolchain } from './toolchain'

export class DevContainerConfig {
    public static transaction(process: (config: DevContainerConfig) => void) {
        let config = new DevContainerConfig()
        process(config)
        config.save()
    }
    
    private path: string
    config: any
    
    constructor(path?: string) {
        this.path = path ?? `${projectDirectory}/.devcontainer/devcontainer.json`
        this.config = JSON5.parse(fs.readFileSync(this.path, 'utf8'))
    }

    public transaction(process: (config: DevContainerConfig) => void) {
        process(this)
        this.save()
    }

    public save() {
        const devContainerContent = JSON.stringify(this.config, null, '\t')
        fs.writeFileSync(this.path, devContainerContent, 'utf8')
    }

    public static swiftVersion(): { major: number, minor: number, patch: number } {
        const obj = new DevContainerConfig()
        const fallbackVersion = { major: 6, minor: 0, patch: 0 }
        if (!obj.config.containerEnv) return fallbackVersion
        const majorString = obj.config.containerEnv.S_VERSION_MAJOR
        const minorString = obj.config.containerEnv.S_VERSION_MINOR
        const patchString = obj.config.containerEnv.S_VERSION_PATCH
        if (!majorString) return fallbackVersion
        const major = parseInt(majorString)
        const minor = minorString ? parseInt(minorString) : 0
        const patch = patchString ? parseInt(patchString) : 0
        return { major: major, minor: minor, patch: patch }
    }

    public static checkIfStaticLinuxArtifactURLPresent(): boolean {
        const config = new DevContainerConfig()
        return config.checkIfContainerEnvKeyExists('S_ARTIFACT_STATIC_LINUX_URL')
    }

    public static checkIfAndroidArtifactURLPresent(): boolean {
        const config = new DevContainerConfig()
        return config.checkIfContainerEnvKeyExists('S_ARTIFACT_ANDROID_URL')
    }

    public static checkIfWasiThreadsArtifactURLPresent(): boolean {
        const config = new DevContainerConfig()
        return config.checkIfContainerEnvKeyExists('S_ARTIFACT_WASIP1_THREADS_URL')
    }

    public setStaticLinuxArtifactURL(url: string) {
        this.config.containerEnv.S_ARTIFACT_STATIC_LINUX_URL = url
    }

    public setAndroidArtifactURL(url: string) {
        this.config.containerEnv.S_ARTIFACT_ANDROID_URL = url
    }

    public setWasip1ThreadsArtifactURL(url: string) {
        this.config.containerEnv.S_ARTIFACT_WASIP1_THREADS_URL = url
    }
    
    private checkIfKeyExists(key: string): boolean {
        if (!this.config.hasOwnProperty(key)) return false
        return true
    }
    
    private checkIfContainerEnvKeyExists(key: string): boolean {
        if (!this.checkIfKeyExists('containerEnv')) return false
        const containerEnv = this.config.containerEnv!
        if (!containerEnv.hasOwnProperty(key)) return false
        return true
    }

    // MARK: Ports

    public addOrChangePort(outer: string, inner: string) {
        const newValue = `${outer}:${inner}`
        if (!this.config.appPort) {
            this.config.appPort = [newValue]
        } else {
            const index = this.config.appPort.findIndex((x: string) => x.endsWith(`:${inner}`))
            if (index >= 0) {
                this.config.appPort[index] = newValue
            } else {
                this.config.appPort.push(newValue)
            }
        }
    }

    public removePort(inner: string) {
        if (!this.config.appPort || this.config.appPort.length == 0) {
            return
        }
        const index = this.config.appPort.findIndex((x: string) => x.endsWith(`:${inner}`))
        if (index >= 0) {
            this.config.appPort.splice(index, 1)
        }
    }

    // MARK: Mounts

    public static listMounts(): any[] {
        const config = new DevContainerConfig()
        return config.listMounts()
    }

    public static permanentMountSources = ['swift-toolchains', 'swift-sdks']

    public listMounts(): any[] {
        return this.config.mounts
    }

    public addOrChangeMount(mount: any, search: (mount: any) => boolean) {
        if (!this.config.mounts) {
            this.config.mounts = [mount]
        } else {
            const index = this.config.mounts.findIndex(search)
            if (index >= 0) {
                this.config.mounts[index] = mount
            } else {
                this.config.mounts.push(mount)
            }
        }
    }

    public static findMount(search: (mount: any) => boolean): any | undefined {
        const config = new DevContainerConfig()
        return config.findMount(search)
    }

    public findMount(search: (mount: any) => boolean): any | undefined {
        if (!this.config.mounts || this.config.mounts.length == 0) {
            return undefined
        }
        return this.config.mounts.find(search)
    }

    public removeMount(search: (mount: any) => boolean) {
        if (!this.config.mounts || this.config.mounts.length == 0) {
            return
        }
        const index = this.config.mounts.findIndex(search)
        if (index >= 0) {
            this.config.mounts.splice(index, 1)
        }
    }

    // MARK: Features

    /// Returns feature key
    public hasFeature(repo: string): any {
        const features: any = this.config.features ?? {}
        return Object.keys(features).find((x) => x.startsWith(repo))
    }

    public addFeature(repo: string, version: string, params: any) {
        const key = `${repo}:${version}`
        if (!this.config.features) {
            this.config.features = {}
        }
        this.config.features[key] = params
    }

    public removeFeature(repo: string): boolean {
        if (!this.config.features) return false
        const key = this.hasFeature(repo)
        if (!key) return false
        delete this.config.features[key]
        if (Object.keys(this.config.features).length == 0) {
            delete this.config.features
        }
        return true
    }
}

// MARK: Generator

export enum EmbeddedBranch {
	RASPBERRY = 'RASPBERRY',
	ESP32 = 'ESP32',
	STM32 = 'STM32',
	NRF = 'NRF',
}

export const generateAndWriteDevcontainerJson = (
	pathTo: string,
    stream: ExtensionStream,
	swiftVersion: { major: number, minor: number },
	options?: {
		embedded?: {
			branch: EmbeddedBranch
		}
	}
): boolean => {
    const generatedJson = generateDevcontainerJson(stream, swiftVersion, options)
    if (!generatedJson) return false
    const devContainerContent = JSON.stringify(generatedJson, null, '\t')
    fs.writeFileSync(pathTo, devContainerContent, 'utf8')
    return true
}

export const generateDevcontainerJson = (
	stream: ExtensionStream,
	swiftVersion: { major: number, minor: number },
	options?: {
		embedded?: {
			branch: EmbeddedBranch
		}
	}
): any | undefined => {
	const toolchain = findTheRightToolchain(stream, { major: swiftVersion.major, minor: swiftVersion.minor })
	let devcontainerObject = {
		name: 'swiftstream',
		build: {
			dockerfile: 'Dockerfile',
			args: {}
		},
		containerEnv: {
			S_MODE: `${stream == ExtensionStream.Unknown ? ExtensionStream.Pure : stream}`,
			S_TOOLCHAIN_URL_X86: toolchain.toolchain_urls.x86_64,
			S_TOOLCHAIN_URL_ARM: toolchain.toolchain_urls.aarch64,
			S_VERSION_MAJOR: `${toolchain.version.major}`,
			S_VERSION_MINOR: `${toolchain.version.minor}`,
			S_VERSION_PATCH: `${toolchain.version.patch}`
		},
		appPort: new Array<string>(),
		otherPortsAttributes: {},
		postStartCommand: 'cmd.sh',
		customizations: {
			vscode: {
				extensions: [
					'swiftstream.swiftstream',
					'swiftlang.swift-vscode',
					'mateocerquetella.xcode-12-theme'
				],
				settings: {
					'extensions.ignoreRecommendations': true,
					'remote.autoForwardPorts': false,
					'swift.path': `/swift/toolchains/${toolchain.name}/usr/bin`,
					'swift.swiftEnvironmentVariables': {
						DEVELOPER_DIR: 'public'
					},
					'lldb.library': `/swift/toolchains/${toolchain.name}/usr/lib/liblldb.so`,
					'lldb.launch.expressions': "native",
					'swift.disableAutoResolve': false,
					'swift.autoGenerateLaunchConfigurations': true,
					'swift.backgroundCompilation': false,
					'swift.showCreateSwiftProjectInWelcomePage': false,
					'editor.semanticHighlighting.enabled': true,
					'editor.fontFamily': 'Verdana, Verdana, Menlo, Monaco, \'Courier New\', monospace',
					'editor.codeLensFontFamily': 'Verdana, Verdana, Menlo, Monaco, \'Courier New\', monospace'
				}
			}
		},
		capAdd: ['SYS_PTRACE'],
        securityOpt: [ 'seccomp=unconfined' ],
		mounts: [
            { source: "${localWorkspaceFolderBasename}-build", target: "${containerWorkspaceFolder}/.build", type: 'volume' },
			{ source: 'swift-toolchains', target: '/swift/toolchains', type: 'volume' },
			{ source: 'swift-sdks', target: '/swift/sdks', type: 'volume' }
		]
	}
	switch (stream) {
		case ExtensionStream.Android:
            if (toolchain.artifact_url) {
				devcontainerObject.containerEnv['S_ARTIFACT_ANDROID_URL'] = toolchain.artifact_url
			}
            devcontainerObject.containerEnv['S_ANDROID_VERSION'] = '24-0.1'
			break
		case ExtensionStream.Embedded:
			if (options?.embedded) {
				devcontainerObject.containerEnv['S_EMBEDDED_BRANCH'] = options.embedded.branch.toUpperCase()
				switch (options.embedded.branch) {
					case EmbeddedBranch.ESP32:
						devcontainerObject.containerEnv['IDF_VERSION'] = '5.3'
						devcontainerObject.containerEnv['IDF_CHIP_TARGETS'] = 'esp32c6'
						devcontainerObject.containerEnv['IDF_TARGET'] = 'esp32c6'
						devcontainerObject.containerEnv['IDF_PATH'] = '/embedded/esp'
						devcontainerObject.containerEnv['IDF_TOOLS_PATH'] = '/embedded/esp/.espressif'
						devcontainerObject.mounts.push({ source: 'esp-idf', target: '/embedded/esp', type: 'volume' })
						break
					case EmbeddedBranch.RASPBERRY:
						devcontainerObject.containerEnv['PICO_SDK_VERSION'] = '2.1.1'
						devcontainerObject.containerEnv['PICO_TOOLCHAIN_PATH'] = '/usr'
						devcontainerObject.mounts.push({ source: 'raspberry', target: '/embedded/raspberry', type: 'volume' })
						break
					case EmbeddedBranch.STM32:
						break
					case EmbeddedBranch.NRF:
						devcontainerObject.containerEnv['TOOLCHAINS'] = 'swift'
						devcontainerObject.containerEnv['ZEPHYR_BASE'] = '/workspaces/zephyr'
						devcontainerObject.mounts.push({ source: 'zephyr', target: '/workspaces/zephyr', type: 'volume' })
						devcontainerObject.mounts.push({ source: 'zephyr-modules', target: '/workspaces/modules', type: 'volume' })
						break
				}
			}
			devcontainerObject.customizations.vscode.extensions.push('wokwi.wokwi-vscode')
			break
		case ExtensionStream.Server:
			if (toolchain.artifact_url) {
				devcontainerObject.containerEnv['S_ARTIFACT_STATIC_LINUX_URL'] = toolchain.artifact_url
			}
			break
		case ExtensionStream.Web:
            const crawlBots: string[] = [
                'ahrefsbot',
                'applebot',
                'baiduspider',
                'bingbot',
                'developers.google.com',
                'discordbot',
                'duckduckbot',
                'exabot',
                'facebookexternalhit',
                'gigabot',
                'googlebot',
                'ia_archiver',
                'linkedinbot',
                'mj12bot',
                'pinterestbot',
                'rogerbot',
                'semrushbot',
                'seznambot',
                'skypeuripreview',
                'slackbot',
                'slurp',
                'sogou',
                'telegrambot',
                'twitterbot',
                'whatsapp',
                'yahoo',
                'yandex',
                'yeti',
                'yodaobot'
            ]
            devcontainerObject.containerEnv['S_NGINX_CRAWLERS'] = crawlBots.join('|')
			devcontainerObject.appPort.push('7700:443')
			devcontainerObject.appPort.push('8800:444')
			devcontainerObject.appPort.push('9900:3080')
			devcontainerObject.otherPortsAttributes['onAutoForward'] = 'ignore'
			devcontainerObject.customizations.vscode.extensions.push('ms-vscode.wasm-dwarf-debugging')
			if (toolchain.version.major >= 6) {
				if (toolchain.artifact_urls?.wasi) {
					devcontainerObject.containerEnv['S_ARTIFACT_WASI_URL'] = toolchain.artifact_urls.wasi
				}
				if (toolchain.artifact_urls?.wasip1_threads) {
					devcontainerObject.containerEnv['S_ARTIFACT_WASIP1_THREADS_URL'] = toolchain.artifact_urls.wasip1_threads
				}
			}
			break
		default:
			if (toolchain.artifact_url) {
				devcontainerObject.containerEnv['S_ARTIFACT_STATIC_LINUX_URL'] = toolchain.artifact_url
			}
			break
	}
	
	return devcontainerObject
}