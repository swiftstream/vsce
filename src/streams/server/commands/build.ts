import { commands, window } from 'vscode'
import { resolveSwiftDependencies } from '../../../commands/build/resolveSwiftDependencies'
import { sidebarTreeView } from '../../../extension'
import { isString } from '../../../helpers/isString'
import { TimeMeasure } from '../../../helpers/timeMeasureHelper'
import { SwiftTargets } from '../../../swift'
import { buildStatus, isBuildingDebug, LogLevel, print, status, StatusType } from '../../stream'
import { ServerStream } from '../serverStream'
import { buildExecutableTarget } from './build/buildExecutableTarget'
import { AbortHandler } from '../../../bash'

export let cachedSwiftTargets: SwiftTargets | undefined
export let selectedSwiftTarget: string | undefined

export async function buildCommand(serverStream: ServerStream) {
    if (isBuildingDebug || serverStream.isAnyHotBuilding()) { return }
    const measure = new TimeMeasure()
    const abortHandler = serverStream.setAbortBuildingDebugHandler(() => {
        measure.finish()
        status('circle-slash', `Aborted Build after ${measure.time}ms`, StatusType.Default)
        print(`🚫 Aborted Build after ${measure.time}ms`)
        console.log(`Aborted Build after ${measure.time}ms`)
        serverStream.setBuildingDebug(false)
        sidebarTreeView?.refresh()
    })
    serverStream.setBuildingDebug(true)
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
        commands.executeCommand('setContext', 'hasCachedTargets', selectedSwiftTarget !== undefined)
        await askToChooseSwiftTargetIfNeeded(serverStream, { abortHandler: abortHandler, force: true })
        if (!selectedSwiftTarget) 
            throw `Please select Swift target to build`
        // Phase 3: Build executable targets
        print('🔳 Phase 3: Build executable targets', LogLevel.Verbose)
        await buildExecutableTarget({
            target: selectedSwiftTarget,
            release: false,
            force: true,
            abortHandler: abortHandler
        })
        measure.finish()
        if (abortHandler.isCancelled) return
        status('check', `Build Succeeded in ${measure.time}ms`, StatusType.Success)
        print(`✅ Build Succeeded in ${measure.time}ms`)
        console.log(`Build Succeeded in ${measure.time}ms`)
        serverStream.setBuildingDebug(false)
        sidebarTreeView?.refresh()
    } catch (error: any) {
        serverStream.setBuildingDebug(false)
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

export async function askToChooseSwiftTargetIfNeeded(serverStream: ServerStream, options?: { abortHandler: AbortHandler, force?: boolean }) {
    if (options?.force === true || !selectedSwiftTarget) {
        try {
            if (options?.force === true || !cachedSwiftTargets) {
                const targetsDump = await serverStream.swift.getTargets(options?.abortHandler ? { abortHandler: options.abortHandler } : undefined)
                cachedSwiftTargets = targetsDump
            }
            const allTargets = cachedSwiftTargets.all({ excludeTests: true })
            commands.executeCommand('setContext', 'hasCachedTargets', allTargets.length > 0)
            if (allTargets.length == 1) {
                selectedSwiftTarget = allTargets[0]
            } else if (allTargets.length > 0) {
                await chooseDebugTarget()
            }
            if (selectedSwiftTarget) sidebarTreeView?.refresh()
        } catch (error) {
            if (!cachedSwiftTargets) throw error
        }
    }
}

export async function rebuildSwift(params?: { target?: string }) {
    // TODO: rebuildSwift(this, params)
}

export async function chooseDebugTarget() {
    const allTargets = cachedSwiftTargets?.all({ excludeTests: true }) ?? []
    if (allTargets.length > 0) {
        selectedSwiftTarget = await window.showQuickPick(allTargets, {
            placeHolder: `Select Swift target to build`
        })
    }
    if (selectedSwiftTarget) sidebarTreeView?.refresh()
}