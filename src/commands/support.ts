import { env, Uri, window } from "vscode"

export function webDocumentationCommand() {
	window.showInformationMessage(`webDocumentationCommand`)
	env.openExternal(Uri.parse('https://swifweb.com'))
}

export function androidDocumentationCommand() {
	window.showInformationMessage(`androidDocumentationCommand`)
	env.openExternal(Uri.parse('https://swifdroid.com'))
}

export function vaporDocumentationCommand() {
	window.showInformationMessage(`vaporDocumentationCommand`)
	env.openExternal(Uri.parse('https://docs.vapor.codes'))
}

export function hummingbirdDocumentationCommand() {
	window.showInformationMessage(`hummingbirdDocumentationCommand`)
	env.openExternal(Uri.parse('https://docs.hummingbird.codes/2.0/documentation/hummingbird/'))
}

export function serverDocumentationCommand() {
	window.showInformationMessage(`hummingbirdDocumentationCommand`)
	env.openExternal(Uri.parse('https://swift.stream'))
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