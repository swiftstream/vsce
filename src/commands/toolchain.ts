import * as fs from 'fs'
import { ProgressLocation, window } from "vscode"
import { currentToolchain, pendingNewToolchain, setPendingNewToolchain } from "../webber"
import { projectDirectory } from "../extension"
import { openDocumentInEditor } from "../helpers/openDocumentInEditor"

export async function toolchainCommand(selectedType?: string) {
	const toolchainsURL = `https://api.github.com/repos/swiftwasm/swift/releases?per_page=100`
	interface Tag {
		name: string
	}
	async function getTags(page: number = 1): Promise<Tag[]> {
		const response = await fetch(`${toolchainsURL}&page=${page}`)
		if (!response.ok) throw new Error('Toolchains response was not ok')
		const rawText: string = await response.text()
		console.dir(response)
		const rawTags: any[] = JSON.parse(rawText)
		console.dir(rawTags)
		return rawTags.map((x) => {
			return { name: x.tag_name }
		})
	}
	var tags: Tag[] = []
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
			const results = await Promise.all([await getTags(1), await getTags(2), await getTags(3)])
			tags = [...results[0], ...results[1], ...results[2]]
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
		var selectedTags: Tag[] = []
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
		const versionToReplace = pendingNewToolchain ? pendingNewToolchain : currentToolchain
		if (selectedToolchainName == versionToReplace) return
		const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
		var devContainerContent: string = fs.readFileSync(devContainerPath, 'utf8')
		if (devContainerContent) {
			if (!devContainerContent.includes(versionToReplace)) {
				const res = await window.showErrorMessage(`Toolchain doesn't match in devcontainer.json`, 'Edit manually', 'Cancel')
				if (res == 'Edit manually')
					await openDocumentInEditor(devContainerPath, `"S_TOOLCHAIN"`)
				return
			}
			devContainerContent = devContainerContent.replaceAll(versionToReplace, selectedToolchainName)
			fs.writeFileSync(devContainerPath, devContainerContent)
			setPendingNewToolchain(selectedToolchainName)
		}
	}
}