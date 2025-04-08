import { env, Uri } from 'vscode'
import { currentToolchain } from '../toolchain'
import { extensionStream } from '../extension'

export function openWebDocumentation() {
	env.openExternal(Uri.parse('https://swifweb.com'))
}

export function openAndroidDocumentation() {
	env.openExternal(Uri.parse('https://swifdroid.com'))
}

export function openVaporDocumentation() {
	env.openExternal(Uri.parse('https://docs.vapor.codes'))
}

export function openHummingbirdDocumentation() {
	env.openExternal(Uri.parse('https://docs.hummingbird.codes'))
}

export function openSwiftStreamDocumentation() {
	env.openExternal(Uri.parse('https://swift.stream'))
}

export function openSwiftGettingStarted() {
	env.openExternal(Uri.parse('https://www.swift.org/getting-started/'))
}

export function openWebRepository() {
	env.openExternal(Uri.parse('https://github.com/swifweb'))
}

export function openAndroidRepository() {
	env.openExternal(Uri.parse('https://github.com/swifdroid'))
}

export function openVaporRepository() {
	env.openExternal(Uri.parse('https://github.com/vapor'))
}

export function openHummingbirdRepository() {
	env.openExternal(Uri.parse('https://github.com/hummingbird-project'))
}

export function openWebDiscussions() {
	env.openExternal(Uri.parse('https://github.com/orgs/swifweb/discussions'))
}

export function openAndroidDiscussions() {
	env.openExternal(Uri.parse('https://github.com/orgs/swifdroid/discussions'))
}

export function openVaporDiscussions() {
	env.openExternal(Uri.parse('https://github.com/vapor/vapor/issues'))
}

export function openHummingbirdDiscussions() {
	env.openExternal(Uri.parse('https://github.com/hummingbird-project/hummingbird/discussions'))
}

export function submitSwiftStreamVSCEIssue() {
	env.openExternal(Uri.parse('https://github.com/swiftstream/vsce/issues/new/choose'))
}

export function submitWebIssue() {
	env.openExternal(Uri.parse('https://github.com/swifweb/web/issues/new/choose'))
}

export function submitCrawlServerIssue() {
	env.openExternal(Uri.parse('https://github.com/swiftstream/crawl-server/issues/new/choose'))
}

export function submitAndroidIssue() {
	env.openExternal(Uri.parse('https://github.com/swifdroid/droid/issues/new/choose'))
}

export function submitVaporIssue() {
	env.openExternal(Uri.parse('https://github.com/vapor/vapor/issues/new/choose'))
}

export function submitHummingbirdIssue() {
	env.openExternal(Uri.parse('https://github.com/hummingbird-project/hummingbird/issues/new/choose'))
}

export function openWebDiscord() {
	env.openExternal(Uri.parse('https://discord.gg/pBC5uApg9m'))
}

export function openAndroidDiscord() {
	env.openExternal(Uri.parse('https://discord.gg/pBC5uApg9m'))
}

export function openVaporDiscord() {
	env.openExternal(Uri.parse('https://discord.com/invite/vapor'))
}

export function openHummingbirdDiscord() {
	env.openExternal(Uri.parse('https://discord.gg/4twfgYqdat'))
}

export function openWebTelegram() {
	env.openExternal(Uri.parse('https://t.me/web_side_swift'))
}

export function openServerTelegram() {
	env.openExternal(Uri.parse('https://t.me/server_side_swift'))
}

export function openAndroidTelegram() {
	env.openExternal(Uri.parse('https://t.me/android_side_swift'))
}

export function openSwiftStreamServerDiscord() {
	env.openExternal(Uri.parse('https://discord.gg/q5wCPYv'))
}

export function openWebForums() {
	env.openExternal(Uri.parse('https://forums.swift.org/c/related-projects/swift-for-webassembly'))
}

export function openServerForums() {
	env.openExternal(Uri.parse('https://forums.swift.org/c/server/43'))
}

export function openAndroidForums() {
	env.openExternal(Uri.parse('https://forums.swift.org/c/development/android'))
}

export function openSwiftForums() {
	env.openExternal(Uri.parse('https://forums.swift.org'))
}

export function emailTheAuthor() {
	const subject = encodeURIComponent('Swift Stream Feedback')
	const body = encodeURIComponent(`Hi Mike,\n\n\n\n---Project Details---\nType: ${extensionStream}\nToolchain: ${currentToolchain}`)
	env.openExternal(Uri.parse(`mailto:imike@swift.stream?subject=${subject}&body=${body}`))
}