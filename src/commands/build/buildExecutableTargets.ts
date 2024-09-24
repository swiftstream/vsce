import { projectDirectory } from "../../extension";
import { getLastModifiedDate, LastModifiedDateType, saveLastModifiedDateForKey, wasFileModified, wasPathModified } from "../../helpers/filesHelper";
import { SwiftBuildType } from "../../swift";
import { buildStatus, LogLevel, print } from "../../webber";
import { buildSwiftTarget } from "./helpers";

export async function buildExecutableTarget(options: { type: SwiftBuildType, target: string, release: boolean, force: boolean }) {
        if (!options.force && !doesModifiedAnySwiftFile(options.type)) {
            print(`buildExecutableTargets skipping for .${options.type} because force == false and not modified any swift file`, LogLevel.Verbose)
            return
        }
        print(`🧱 Building \`${options.target}\` Swift target`)
		buildStatus(`\`${options.target}\` Swift target: building`)
        print(`Building ${options.target} target for ${options.type} in ${options.release ? 'release' : 'debug'} mode`, LogLevel.Detailed)
        await buildSwiftTarget({ type: options.type, targetName: options.target, release: false, progressHandler: (p) => {
            buildStatus(`\`${options.target}\` Swift target: building ${p}`)
        } })
        saveLastModifiedDateForKey(LastModifiedDateType.SwiftSources, options.type)
        // TODO: if dependencies tracking enabled then save timestamp for it as well
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