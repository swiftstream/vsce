import * as fs from 'fs'
import { projectDirectory, webber } from "../../extension"
import { LogLevel, print } from "../../webber"
import { SwiftBuildType } from '../../swift'
import { getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey, wasFileModified } from '../../helpers/filesHelper'

export async function resolveSwiftDependencies(options: { type: SwiftBuildType, force: boolean, substatus: (x: string) => void }) {
    if (!doesBuildFolderExists(options.type)) {
        print(`Swift .${options.type} dependencies never been resolved, let's do it`, LogLevel.Detailed)
        await resolveSwiftPackages(options.type)
        saveLastModifiedDateForKey(LastModifiedDateType.SwiftPackage, options.type)
    }
    // if force == true and Package.swift was modified
    else if (options.force && wasFileModified({
        path: `${projectDirectory}/Package.swift`,
        lastModifedTimestampMs: getLastModifiedDate(LastModifiedDateType.SwiftPackage, options.type)
    })) {
        print(`Swift .${options.type} Package have been modified, let's resolve dependencies`, LogLevel.Detailed)
        await resolveSwiftPackages(options.type)
        saveLastModifiedDateForKey(LastModifiedDateType.SwiftPackage, options.type)
    }
}
function doesBuildFolderExists(type: SwiftBuildType): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/.${type}`)
	print(`./.build/.${type} ${value ? 'exists' : 'not exists'}`, LogLevel.Verbose)
	return value
}
async function resolveSwiftPackages(type: SwiftBuildType) {
	if (!webber) { throw `webber is null` }
	await webber.swift.packageResolve(type)
}