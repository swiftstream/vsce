import { env, Uri, window } from "vscode"

export function documentationCommand() {
	window.showInformationMessage(`documentationCommand`)
	env.openExternal(Uri.parse('https://swifweb.com'))
}

export function repositoryCommand() {
	env.openExternal(Uri.parse('https://github.com/swifweb'))
}

export function discussionsCommand() {
	env.openExternal(Uri.parse('https://github.com/orgs/swifweb/discussions'))
}

export function submitAnIssueCommand() {
	env.openExternal(Uri.parse('https://github.com/swifweb/web/issues/new/choose'))
}