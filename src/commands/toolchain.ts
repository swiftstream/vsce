import * as fs from 'fs'
import JSON5 from 'json5'
import { ProgressLocation, window } from 'vscode'
import { extensionStream, ExtensionStream, projectDirectory } from '../extension'
import { currentToolchain, getToolchainNameFromURL, getToolchainTags, pendingNewToolchain, setPendingNewToolchain } from '../toolchain'
import { env } from 'process'

export async function getPureArtifactURLForToolchain(): Promise<string | undefined> {
    const result = await fetchCurrentToolchainMetadata(ExtensionStream.Pure)
    return result.artifact_url
}

export async function getWebArtifactURLsForToolchain(): Promise<{ wasi: string, wasip1_threads?: string } | undefined> {
    const result = await fetchCurrentToolchainMetadata(ExtensionStream.Web)
    return result.artifact_urls
}

export async function fetchCurrentToolchainMetadata(stream: ExtensionStream): Promise<any | undefined> {
    if (!env.S_TOOLCHAIN_URL_X86) return undefined
    return new Promise((resolve, reject) => {
        window.withProgress({
            location: ProgressLocation.Notification,
            title: 'Fetching toolchain metadata...',
            cancellable: false
        }, async (progress, token) => {
            try {
				const filtered = getToolchainTags(stream)
                if (!filtered) throw new Error(`Unable to find ${stream} stream in the list`)
                resolve(filtered.find(x => x.toolchain_urls.x86_64 === env.S_TOOLCHAIN_URL_X86 ))
            } catch(error: any) {
                console.dir(error)
                window.showErrorMessage(`Unable to fetch the toolchain metadata`, 'Retry', 'Cancel').then(answer => {
                    if (answer == 'Retry') {
                        try {
                            getPureArtifactURLForToolchain().then(x => resolve(x))
                        } catch {
                            resolve(undefined)
                        }
                    } else {
                        resolve(undefined)
                    }
                })
            }
        })
    })
}

export async function toolchainCommand(selectedType?: string) {
	var tags: any[] = []
	var afterLoadingClosure = async () => {}
	if (!selectedType)
		window.showQuickPick([
			'Release',
			'Development'
		], {
			placeHolder: `Select which kind of tags you're looking for`
		}).then((x) => {
			selectedType = x
			if (tags.length > 0)
				afterLoadingClosure()
		})
	window.withProgress({
		location: ProgressLocation.Notification,
		title: 'Fetching toolchain tags...',
		cancellable: false
	}, async (progress, token) => {
		try {
			tags = getToolchainTags(extensionStream)
			if (selectedType && selectedType.length > 0)
				afterLoadingClosure()
		} catch(error: any) {
			console.dir(error)
			const res = await window.showErrorMessage(`Unable to fetch the list of toolchain tags`, 'Retry', 'Cancel')
			if (res == 'Retry')
				toolchainCommand(selectedType)
		}
	})
	afterLoadingClosure = async () => {
		var selectedTags: any[] = []
		if (selectedType == 'Release') {
			selectedTags = tags.filter((x) => x.name.includes('-RELEASE'))
		} else if (selectedType == 'Development') {
			selectedTags = tags.filter((x) => x.name.includes('-SNAPSHOT'))
		}
		if (selectedTags.length == 0)
			return
		const selectedToolchainName = await window.showQuickPick(selectedTags.map((x) => x.name), {
			placeHolder: `Select desired toolchain version`
		})
		if(!selectedToolchainName || selectedToolchainName.length == 0)
			return
		const selectedTag = selectedTags.filter((x) => x.name == selectedToolchainName)[0]
		if (!selectedTag)
			return

		const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
		var devContainerContent: string = fs.readFileSync(devContainerPath, 'utf8')
		if (devContainerContent) {
			let devContainerJson = JSON5.parse(devContainerContent)
			const currentName = getToolchainNameFromURL(devContainerJson.containerEnv.S_TOOLCHAIN_URL_X86)
			const newName = getToolchainNameFromURL(selectedTag.toolchain_urls.x86_64)
			const versionToReplace = pendingNewToolchain ? pendingNewToolchain : currentToolchain
			if (pendingNewToolchain && newName == versionToReplace) {
				await window.showInformationMessage(`Reload window to start using "${newName}" toolchain`)
				return
			}
			if (currentName === newName) {
				await window.showInformationMessage(`Toolchain "${newName}" is already active`)
				return
			}
			devContainerJson.containerEnv.S_TOOLCHAIN_URL_X86 = selectedTag.toolchain_urls.x86_64
			devContainerJson.containerEnv.S_TOOLCHAIN_URL_ARM = selectedTag.toolchain_urls.aarch64
			devContainerJson.containerEnv.S_VERSION_MAJOR = `${selectedTag.version.major}`
			devContainerJson.containerEnv.S_VERSION_MINOR = `${selectedTag.version.minor}`
			devContainerJson.containerEnv.S_VERSION_PATCH = `${selectedTag.version.patch}`
			if (extensionStream == ExtensionStream.Web) {
				if (selectedTag.artifact_urls) {
					devContainerJson.containerEnv.S_ARTIFACT_WASI_URL = selectedTag.artifact_urls.wasi
					devContainerJson.containerEnv.S_ARTIFACT_WASIP1_THREADS_URL = selectedTag.artifact_urls.wasip1_threads
				} else {
					devContainerJson.containerEnv.S_ARTIFACT_WASI_URL = undefined
					devContainerJson.containerEnv.S_ARTIFACT_WASIP1_THREADS_URL = undefined
				}
			} else if (extensionStream == ExtensionStream.Android) {
                devContainerJson.containerEnv.S_ARTIFACT_ANDROID_URL = selectedTag.artifact_url
            } else if (extensionStream == ExtensionStream.Pure || extensionStream == ExtensionStream.Server) {
                devContainerJson.containerEnv.S_ARTIFACT_STATIC_LINUX_URL = selectedTag.artifact_url
            }
			devContainerJson.customizations.vscode.settings['swift.path'] = `/swift/toolchains/${newName}/usr/bin`
			devContainerJson.customizations.vscode.settings['lldb.library'] = `/swift/toolchains/${newName}/usr/lib/liblldb.so`
			fs.writeFileSync(devContainerPath, JSON.stringify(devContainerJson, null, '\t'))
			setPendingNewToolchain(newName)
			// TODO: check if toolchain is already in the folder; or
			// TODO: ask if would like to download it now
			// TODO: ask if would like to rebuild container now
			await window.showInformationMessage(`Pending window reload to start using "${newName}" toolchain`)
		}
	}
}