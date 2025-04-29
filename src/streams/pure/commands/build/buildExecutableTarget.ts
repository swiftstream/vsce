import { buildSwiftTarget } from '../../../../commands/build/helpers'
import { currentStream, projectDirectory } from '../../../../extension'
import { getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey, wasFileModified, wasPathModified } from '../../../../helpers/filesHelper'
import { TimeMeasure } from '../../../../helpers/timeMeasureHelper'
import { SwiftBuildType } from '../../../../swift'
import { buildStatus, clearStatus, LogLevel, print } from '../../../stream'
import { AbortHandler } from '../../../../bash'
import { PureBuildMode, pureBuildModeToSwiftBuildMode } from '../../pureStream'
import { DevContainerConfig } from '../../../../devContainerConfig'

export async function buildExecutableTarget(options: {
    type?: SwiftBuildType,
    mode: PureBuildMode,
    target: string,
    release: boolean,
    force: boolean,
    abortHandler: AbortHandler
}) {
    if (!options.force && !doesModifiedAnySwiftFile(options.type ?? SwiftBuildType.Native)) {
        print(`💨 Skipping building \`${options.target}\` swift target ${options.type ? `for \`.${options.type}\` ` : ''}in ${options.release ? 'release' : 'debug'} mode because \`force == false\` and not modified any swift file`, LogLevel.Verbose)
        return
    }
    // In Swift 5 mode we possibly could have conflict with initial
    // `swift package resolve` initiated by the official Swift extension
    if (DevContainerConfig.swiftVersion().major == 5) {
        await currentStream?.awaitForCompletionOfOtherSwiftProcessesIfNeeded(`Building \`${options.target}\` swift target`)
    }
    const measure = new TimeMeasure()
    print({
        detailed: `🧱 Building \`${options.target}\` swift target ${options.type ? `for \`.${options.type}\` ` : ''}`,
        verbose: `🧱 Building \`${options.target}\` swift target ${options.type ? `for \`.${options.type}\` ` : ''}in ${options.release ? 'release' : 'debug'} mode`
    })
    buildStatus(`\`${options.target}\` swift target: building`)
    try {
        await buildSwiftTarget({
            type: options.type ?? SwiftBuildType.Native,
            mode: pureBuildModeToSwiftBuildMode(options.mode),
            targetName: options.target,
            release: options.release,
            abortHandler: options.abortHandler,
            progressHandler: (p) => {
                buildStatus(`\`${options.target}\` swift target: building ${p}`)
            }
        })
        saveLastModifiedDateForKey(LastModifiedDateType.SwiftSources, options.type)
        // TODO: if dependencies tracking enabled then save timestamp for it as well
        measure.finish()
        if (options.abortHandler.isCancelled) return
        print({
            detailed: `🧱 Built \`${options.target}\` swift target ${options.type ? `for \`.${options.type}\` ` : ''}in ${measure.time}ms`,
            verbose: `🧱 Built swift target ${options.type ? `for \`.${options.type}\` ` : ''}in ${options.release ? 'release' : 'debug'} mode in ${measure.time}ms`
        })
    } catch (error) {
        clearStatus()
        throw error
    }
}

function doesModifiedAnySwiftFile(type: SwiftBuildType): boolean {
    if (wasFileModified({
        path: `${projectDirectory}/Package.swift`,
        lastModifedTimestampMs: getLastModifiedDate(LastModifiedDateType.SwiftPackage, type)
    })) return true
    if (wasPathModified({
        path: `${projectDirectory}/Sources`,
        recursive: true,
        lastModifedTimestampMs: getLastModifiedDate(LastModifiedDateType.SwiftSources, type)
    })) return true
    // TODO: check also modifications in dependencies if enabled
    return false
}