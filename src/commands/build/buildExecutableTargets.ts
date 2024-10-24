import { projectDirectory } from "../../extension";
import { getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey, wasFileModified, wasPathModified } from "../../helpers/filesHelper";
import { TimeMeasure } from "../../helpers/timeMeasureHelper";
import { SwiftBuildType } from "../../swift";
import { buildStatus, LogLevel, print } from "../../webber";
import { buildSwiftTarget } from "./helpers";

export async function buildExecutableTarget(options: { type: SwiftBuildType, target: string, release: boolean, force: boolean }) {
        if (!options.force && !doesModifiedAnySwiftFile(options.type)) {
            print(`💨 Skipping building \`${options.target}\` swift target for \`.${options.type}\` in ${options.release ? 'release' : 'debug'} mode because \`force == false\` and not modified any swift file`, LogLevel.Verbose)
            return
        }
        const measure = new TimeMeasure()
        print({
            detailed: `🧱 Building \`${options.target}\` swift target for \`.${options.type}\``,
            verbose: `🧱 Building \`${options.target}\` swift target for \`.${options.type}\` in ${options.release ? 'release' : 'debug'} mode`
        })
        buildStatus(`\`${options.target}\` swift target: building`)
        await buildSwiftTarget({ type: options.type, targetName: options.target, release: options.release , progressHandler: (p) => {
            buildStatus(`\`${options.target}\` swift target: building ${p}`)
        } })
        saveLastModifiedDateForKey(LastModifiedDateType.SwiftSources, options.type)
        // TODO: if dependencies tracking enabled then save timestamp for it as well
        measure.finish()
        print({
            detailed: `🧱 Built \`${options.target}\` swift target for \`.${options.type}\` in ${measure.time}ms`,
            verbose: `🧱 Built swift target for \`.${options.type}\` in ${options.release ? 'release' : 'debug'} mode in ${measure.time}ms`
        })
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