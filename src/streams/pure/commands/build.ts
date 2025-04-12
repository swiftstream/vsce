import { resolveSwiftDependencies } from '../../../commands/build/resolveSwiftDependencies'
import { sidebarTreeView } from '../../../extension'
import { isString } from '../../../helpers/isString'
import { TimeMeasure } from '../../../helpers/timeMeasureHelper'
import { buildStatus, isBuildingDebug, LogLevel, print, status, StatusType } from '../../stream'
import { PureBuildMode, PureStream } from '../pureStream'
import { buildExecutableTarget } from './build/buildExecutableTarget'
import { restartLSPCommand } from '../../../commands/restartLSP'

let hasRestartedLSP = false

export async function buildCommand(stream: PureStream, buildMode: PureBuildMode) {
    if (isBuildingDebug || stream.isAnyHotBuilding()) { return }
    const measure = new TimeMeasure()
    const abortHandler = stream.setAbortBuildingDebugHandler(() => {
        measure.finish()
        status('circle-slash', `Aborted Build after ${measure.time}ms`, StatusType.Default)
        print(`🚫 Aborted Build after ${measure.time}ms`)
        console.log(`Aborted Build after ${measure.time}ms`)
        stream.setBuildingDebug(false)
        sidebarTreeView?.refresh()
    })
    stream.setBuildingDebug(true)
    sidebarTreeView?.cleanupErrors()
    sidebarTreeView?.refresh()
    try {
        print(`🏗️ Started building debug`, LogLevel.Normal, true)
        // Phase 1: Resolve Swift dependencies for each build type
        print('🔳 Phase 1: Resolve Swift dependencies for each build type', LogLevel.Verbose)
        await resolveSwiftDependencies({
            force: true,
            substatus: (t) => {
                buildStatus(`Resolving dependencies: ${t}`)
                print(`🔦 Resolving Swift dependencies ${t}`, LogLevel.Verbose)
            },
            abortHandler: abortHandler
        })
        // Phase 2: Retrieve Swift targets
        print('🔳 Phase 2: Retrieve Swift targets', LogLevel.Verbose)
        await stream.chooseTarget({ release: false, abortHandler: abortHandler })
        if (!stream.swift.selectedDebugTarget) 
            throw `Please select Swift target to build`
        const shouldRestartLSP = !hasRestartedLSP || !stream.isDebugBuilt(stream.swift.selectedDebugTarget, buildMode)
        // Phase 3: Build executable targets
        print('🔳 Phase 3: Build executable targets', LogLevel.Verbose)
        await buildExecutableTarget({
            target: stream.swift.selectedDebugTarget,
            mode: buildMode,
            release: false,
            force: true,
            abortHandler: abortHandler
        })
        measure.finish()
        if (abortHandler.isCancelled) return
        status('check', `Build Succeeded in ${measure.time}ms`, StatusType.Success)
        print(`✅ Build Succeeded in ${measure.time}ms`)
        console.log(`Build Succeeded in ${measure.time}ms`)
        stream.setBuildingDebug(false)
        sidebarTreeView?.refresh()
        if (shouldRestartLSP) {
            hasRestartedLSP = true
            restartLSPCommand(true)
        }
    } catch (error: any) {
        stream.setBuildingDebug(false)
        sidebarTreeView?.refresh()
        const text = `Debug Build Failed`
        if (isString(error)) {
            print(`🧯 ${error}`)
        } else {
            const json = JSON.stringify(error)
            const errorText = `${json === '{}' ? error : json}`
            print(`🧯 ${text}: ${errorText}`)
            console.error(error)
        }
        status('error', `${text} (${measure.time}ms)`, StatusType.Error)
    }
}

export async function rebuildSwift(params?: { target?: string }) {
    // TODO: rebuildSwift(this, params)
}