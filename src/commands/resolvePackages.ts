import { currentStream, sidebarTreeView } from '../extension'
import { buildStatus, isResolvingPackages, LogLevel, print, status, StatusType } from '../streams/stream'
import { resolveSwiftDependencies } from './build/resolveSwiftDependencies'
import { TimeMeasure } from '../helpers/timeMeasureHelper'

export async function resolvePackagesCommand() {
    if (isResolvingPackages) return
    const measure = new TimeMeasure()
    const abortHandler = currentStream?.setAbortBuildingDebugHandler(() => {
        measure.finish()
        status('circle-slash', `Aborted Resolving Packages after ${measure.time}ms`, StatusType.Default)
        print(`🚫 Aborted Resolving Packages after ${measure.time}ms`)
        console.log(`Aborted Resolving Packages after ${measure.time}ms`)
        sidebarTreeView?.refresh()
    })
    if (!abortHandler) return
    currentStream?.setResolvingPackages()
    await resolveSwiftDependencies({
        force: true,
        substatus: (t) => {
            buildStatus(`Resolving dependencies: ${t}`)
            print(`🔦 Resolving Swift dependencies ${t}`, LogLevel.Verbose)
        },
        abortHandler: abortHandler
    })
    status('check', `Resolved Packages in ${measure.time}ms`, StatusType.Success)
    await new Promise((x) => setTimeout(x, 1000))
    currentStream?.setResolvingPackages(false)
}