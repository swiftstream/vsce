import * as fs from 'fs'
import { projectDirectory, webber } from "../../extension"
import { buildStatus, LogLevel, print } from "../../webber"
import { SwiftBuildType } from '../../swift'
import { getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey, wasFileModified } from '../../helpers/filesHelper'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'

export async function resolveSwiftDependencies(options: { type: SwiftBuildType, force: boolean, substatus: (x: string) => void }) {
    const measure = new TimeMeasure()
    if (!doesBuildFolderExists(options.type)) {
        print({
            detailed: `🔦 Resolving Swift dependencies for ${options.type}`,
            verbose: `🔦 Resolving Swift dependencies at \`.${options.type}\` for the first time`
        })
		buildStatus(`Resolving dependencies`)
        await resolveSwiftPackages(options.type)
        saveLastModifiedDateForKey(LastModifiedDateType.SwiftPackage, options.type)
        measure.finish()
        print(`🔦 Resolved in ${measure.time}ms`, LogLevel.Detailed)
    }
    // if force == true and Package.swift was modified
    else if (options.force && wasFileModified({
        path: `${projectDirectory}/Package.swift`,
        lastModifedTimestampMs: getLastModifiedDate(LastModifiedDateType.SwiftPackage, options.type)
    })) {
        print({
            normal: `🔦 Updating Swift dependencies for \`.${options.type}\``,
            verbose: `🔦 Updating Swift dependencies for \`.${options.type}\` since \`Package.swift\` has been modified`
        })
        await resolveSwiftPackages(options.type)
        saveLastModifiedDateForKey(LastModifiedDateType.SwiftPackage, options.type)
        print(`🔦 Updated in ${measure.time}ms`, LogLevel.Detailed)
    }
}
function doesBuildFolderExists(type: SwiftBuildType): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/.${type}`)
	print(`./.build/.${type} ${value ? 'exists' : 'not exists'}`, LogLevel.Unbearable)
	return value
}
async function resolveSwiftPackages(type: SwiftBuildType) {
	if (!webber) { throw `webber is null` }
	await webber.swift.packageResolve(type)
}