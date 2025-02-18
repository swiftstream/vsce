import * as fs from 'fs'
import { projectDirectory, currentStream } from '../../extension'
import { print } from '../../streams/stream'
import { LogLevel } from '../../streams/stream'
import { SwiftBuildType } from '../../swift'

export enum KnownPackage {
	JavaScriptKit = 'JavaScriptKit',
	Web = 'web',
	Vapor = 'vapor',
	Hummingbird = 'hummingbird'
}
export function doesPackageCheckedOut(packageName: KnownPackage): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/checkouts/${packageName}/Package.swift`)
	print(`./.build/checkouts/${packageName} ${value ? 'exists' : 'not exists'}`, LogLevel.Unbearable)
	return value
}
export async function buildSwiftTarget(options: { type: SwiftBuildType, targetName: string, release: boolean, isCancelled: () => boolean, progressHandler?: (p: string) => void }) {
	if (!currentStream) { throw `webStream is null` }
	await currentStream.swift.build({
		type: options.type,
		targetName: options.targetName,
		release: options.release,
		isCancelled: options.isCancelled,
		progressHandler: options.progressHandler
	})
}