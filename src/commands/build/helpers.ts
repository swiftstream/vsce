import * as fs from 'fs'
import { projectDirectory, currentStream } from '../../extension'
import { print } from '../../streams/stream'
import { LogLevel } from '../../streams/stream'
import { SwiftBuildType } from '../../swift'

export enum KnownPackage {
	JavaScriptKit = 'JavaScriptKit',
	Web = 'web',
	Vapor = 'vapor',
	Hummingbird = 'hummingbird',
	Droid = 'droid'
}
export function doesPackageCheckedOut(packageName: KnownPackage): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/checkouts/${packageName}/Package.swift`)
	print(`./.build/checkouts/${packageName} ${value ? 'exists' : 'not exists'}`, LogLevel.Unbearable)
	return value
}
export function isPackagePresentInResolved(packageName: KnownPackage): boolean {
	const packageResolvedPath = `${projectDirectory}/Package.resolved`
	if (!fs.existsSync(packageResolvedPath)) return false
	const jsonString = fs.readFileSync(packageResolvedPath, 'utf8')
	try {
		const packageResolved = JSON.parse(jsonString)
		const pins: any[] = packageResolved.pins
		return pins.find((x) => x.identity === packageName) != undefined
	} catch (error) {
		print(`❗️ Unable to parse Package.resolved`, LogLevel.Verbose)
		return false
	}
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