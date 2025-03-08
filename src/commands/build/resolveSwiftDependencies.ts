import * as fs from 'fs'
import { projectDirectory, currentStream } from '../../extension'
import { buildStatus, print } from '../../streams/stream'
import { LogLevel } from '../../streams/stream'
import { SwiftBuildType } from '../../swift'
import { getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey, wasFileModified } from '../../helpers/filesHelper'
import { TimeMeasure } from '../../helpers/timeMeasureHelper'
import { AbortHandler } from '../../bash'

export async function resolveSwiftDependencies(options: {
    type?: SwiftBuildType,
    force: boolean,
    substatus: (x: string) => void,
    abortHandler: AbortHandler
}) {
    const packageResolve = async () => {
        if (!currentStream) { throw `stream is null` }
        await currentStream.swift.packageResolve({
            type: options.type ?? SwiftBuildType.Native,
            abortHandler: options.abortHandler,
            progressHandler: (t) => options.substatus(t)
        })
    }
    const measure = new TimeMeasure()
    if (!doesBuildFolderExists(options.type)) {
        print({
            detailed: `🔦 Resolving Swift dependencies ${options.type ? `for ${options.type}` : ''}`,
            verbose: `🔦 Resolving Swift dependencies ${options.type ? `at \`.${options.type}\`` : ''} for the first time`
        })
		buildStatus(`Resolving dependencies`)
        await packageResolve()
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
            normal: `🔦 Updating Swift dependencies ${options.type ? `for \`.${options.type}\`` : ''}`,
            verbose: `🔦 Updating Swift dependencies ${options.type ? `for \`.${options.type}\`` : ''} since \`Package.swift\` has been modified`
        })
        await packageResolve()
        saveLastModifiedDateForKey(LastModifiedDateType.SwiftPackage, options.type)
        print(`🔦 Updated in ${measure.time}ms`, LogLevel.Detailed)
    }
}
function doesBuildFolderExists(type: SwiftBuildType): boolean {
	const value = fs.existsSync(`${projectDirectory}/.build/.${type}`)
	print(`./.build/.${type} ${value ? 'exists' : 'not exists'}`, LogLevel.Unbearable)
	return value
}