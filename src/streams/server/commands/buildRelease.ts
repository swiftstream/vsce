import { commands } from 'vscode'
import { resolveSwiftDependencies } from '../../../commands/build/resolveSwiftDependencies'
import { ContextKey, sidebarTreeView } from '../../../extension'
import { TimeMeasure } from '../../../helpers/timeMeasureHelper'
import { buildStatus, isBuildingRelease, LogLevel, print, status, StatusType } from '../../stream'
import { ServerStream } from '../serverStream'
import { buildExecutableTarget } from './build/buildExecutableTarget'
import { isString } from '../../../helpers/isString'

export async function buildRelease(serverStream: ServerStream, successCallback?: any) {
    if (isBuildingRelease) { return }
    const measure = new TimeMeasure()
    const abortHandler = serverStream.setAbortBuildingReleaseHandler(() => {
        measure.finish()
        status('circle-slash', `Aborted Release Build after ${measure.time}ms`, StatusType.Default)
        print(`🚫 Aborted Release Build after ${measure.time}ms`)
        console.log(`Aborted Release Build after ${measure.time}ms`)
        serverStream.setBuildingRelease(false)
        sidebarTreeView?.refresh()
    })
    serverStream.setBuildingRelease(true)
    sidebarTreeView?.cleanupErrors()
    sidebarTreeView?.refresh()
    try {
        print(`🏗️ Started building release`, LogLevel.Normal, true)
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
        commands.executeCommand('setContext', ContextKey.hasCachedTargets, serverStream.swift.selectedReleaseTarget !== undefined)
        await serverStream.swift.askToChooseTargetIfNeeded({ release: true, abortHandler: abortHandler, force: true })
        if (!serverStream.swift.selectedReleaseTarget) 
            throw `Please select Swift target to build`
        // Phase 3: Build executable targets
        print('🔳 Phase 3: Build executable targets', LogLevel.Verbose)
        await buildExecutableTarget({
            target: serverStream.swift.selectedReleaseTarget,
            release: true,
            force: true,
            abortHandler: abortHandler
        })
        measure.finish()
        if (abortHandler.isCancelled) return
        status('check', `Release Build Succeeded in ${measure.time}ms`, StatusType.Success)
        print(`✅ Release Build Succeeded in ${measure.time}ms`)
        console.log(`Release Build Succeeded in ${measure.time}ms`)
        serverStream.setBuildingRelease(false)
        sidebarTreeView?.refresh()
        if (successCallback) successCallback()
    } catch (error: any) {
        serverStream.setBuildingRelease(false)
        sidebarTreeView?.refresh()
        const text = `Release Build Failed`
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