import * as fs from 'fs'
import JSON5 from 'json5'
import { ProgressLocation, window } from 'vscode'
import { currentToolchain, getToolchainNameFromURL, pendingNewToolchain, setPendingNewToolchain } from '../streams/stream'
import { extensionMode, ExtensionMode, projectDirectory } from '../extension'

export async function toolchainCommand(selectedType?: string) {
	const toolchainsURL = `https://github.com/swiftstream/vsce/raw/refs/heads/main/toolchains.json`
	interface AnyTag {
		name: string,
		version: { major: number, minor: number, patch: number },
		toolchain_urls: { aarch64: string, x86_64: string }
	}
	interface TagAndroid extends AnyTag {
		android_version: string,
		artifact_url: string
	}
	interface TagServer extends AnyTag {}
	interface TagWeb extends AnyTag {
		mode: string,
		artifact_url?: string
	}
	async function getTags<Tag>(mode: ExtensionMode): Promise<Tag[]> {
		const response = await fetch(`${toolchainsURL}`)
		if (!response.ok) throw new Error('Toolchains response was not ok')
		const text = await response.text()
		const json = JSON5.parse(text)
		let key: string = `${mode}`.toLowerCase()
		switch (mode) {
			case ExtensionMode.Android: break
			case ExtensionMode.Web: break
			default: key = 'pure'
		}
		const filtered = json[key]
		return filtered
	}
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
		title: "Loading toolchain tags...",
		cancellable: false
	}, async (progress, token) => {
		try {
			tags = await getTags(extensionMode)
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
			if (extensionMode == ExtensionMode.Web) {
				if (selectedTag.artifact_urls) {
					devContainerJson.containerEnv.S_ARTIFACT_WASI_URL = selectedTag.artifact_urls.wasi
					devContainerJson.containerEnv.S_ARTIFACT_WASIP1_THREADS_URL = selectedTag.artifact_urls.wasip1_threads
				} else {
					devContainerJson.containerEnv.S_ARTIFACT_WASI_URL = undefined
					devContainerJson.containerEnv.S_ARTIFACT_WASIP1_THREADS_URL = undefined
				}
			} else {
				devContainerJson.containerEnv.S_ARTIFACT_URL = selectedTag.artifact_url
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