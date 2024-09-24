import * as fs from 'fs'
import { projectDirectory, webber } from "../../extension"
import { LogLevel, print } from '../../webber'
import { SwiftBuildType } from '../../swift'

export function doesJavaScriptKitCheckedOut(type: SwiftBuildType): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/.${type}/checkouts/JavaScriptKit/Package.swift`)
	print(`./.build/.${type}/checkouts/JavaScriptKit ${value ? 'exists' : 'not exists'}`, LogLevel.Unbearable)
	return value
}
export function doesWebCheckedOut(type: SwiftBuildType): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/.${type}/checkouts/web/Package.swift`)
	print(`./.build/.${type}/checkouts/web ${value ? 'exists' : 'not exists'}`, LogLevel.Unbearable)
	return value
}
export async function buildSwiftTarget(options: { type: SwiftBuildType, targetName: string, release: boolean, progressHandler?: (p: string) => void }) {
	if (!webber) { throw `webber is null` }
	await webber.swift.build({
		type: options.type,
		targetName: options.targetName,
		release: options.release,
		progressHandler: options.progressHandler
	})
}