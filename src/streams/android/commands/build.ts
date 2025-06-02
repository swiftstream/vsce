import { AndroidLibraryProject } from '../../../androidLibraryProject'
import { resolveSwiftDependencies } from '../../../commands/build/resolveSwiftDependencies'
import { restartLSPCommand } from '../../../commands/restartLSP'
import { DevContainerConfig } from '../../../devContainerConfig'
import { sidebarTreeView } from '../../../extension'
import { isString } from '../../../helpers/isString'
import { TimeMeasure } from '../../../helpers/timeMeasureHelper'
import { allSwiftDroidBuildTypes, SwiftBuildType } from '../../../swift'
import { buildStatus, isBuildingDebug, LogLevel, print, status, StatusType } from '../../stream'
import { AndroidStream, DroidBuildArch } from '../androidStream'
import { buildExecutableTarget } from './build/buildExecutableTarget'

let hasRestartedLSP = false

export async function buildCommand(stream: AndroidStream) {
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
		print(`💁‍♂️ it will try to build each phase`, LogLevel.Detailed)
        const targets = ['App']
        // Phase 1: Resolve Swift dependencies for each build type
        print('🔳 Phase 1: Resolve Swift dependencies for each build type', LogLevel.Verbose)
        const buildTypes = allSwiftDroidBuildTypes()
        for (let i = 0; i < buildTypes.length; i++) {
			const type = buildTypes[i]
			await resolveSwiftDependencies({
				type: type,
				force: true,
				substatus: (t) => {
					buildStatus(`Resolving dependencies (${type}): ${t}`)
					print(`🔦 Resolving Swift dependencies ${t}`, LogLevel.Verbose)
				},
				abortHandler: abortHandler
			})
		}
        // Phase 2: Retrieve Swift targets
        print('🔳 Phase 2: Retrieve Swift targets', LogLevel.Verbose)
        const allTargets = await stream.swift.getLibraryProducts({ abortHandler: abortHandler })
        await stream.chooseTarget({ release: false, abortHandler: abortHandler })
        if (!stream.swift.selectedDebugTarget) 
            throw `Please select Swift target to build`
        // Phase 3: Proceed Swift targets
        print('🔳 Phase 3: Proceed Swift targets', LogLevel.Verbose)
        AndroidLibraryProject.proceedTargets({ targets: allTargets })
        // Phase 4: Build executable targets
        const shouldRestartLSP = !hasRestartedLSP || !stream.isDebugBuilt(stream.swift.selectedDebugTarget, DroidBuildArch.Arm64)
        print('🔳 Phase 4: Build executable targets', LogLevel.Verbose)
        // Only one for current device, or all without device
        const archs = stream.currentBuildArch ? [stream.currentBuildArch] : [DroidBuildArch.Arm64, DroidBuildArch.ArmEabi, DroidBuildArch.x86_64]
        for (let i = 0; i < archs.length; i++) {
			const arch = archs[i]
            await buildExecutableTarget({
                type: SwiftBuildType.Droid,
                target: stream.swift.selectedDebugTarget,
                arch: arch,
                release: false,
                force: true,
                abortHandler: abortHandler
            })
        }
        // Phase 5: Create or repair Library project
        const swiftVersion = DevContainerConfig.swiftVersion()
        const swiftVersionString = `${swiftVersion.major}.${swiftVersion.minor}.0`
        print('🔳 Phase 5: Create or repair Library project', LogLevel.Verbose)
        AndroidLibraryProject.generateIfNeeded({
            package: 'com.my.lib',
            name: 'MyLib',
            targets: targets,
            compileSdk: 35,
            minSdk: 21,
            javaVersion: 11,
            swiftVersion: swiftVersionString
        })
        // Phase 6: Copy .so files into Library project
        print('🔳 Phase 6: Copy .so files', LogLevel.Verbose)
        AndroidLibraryProject.copySoFiles({
            release: false,
            targets: targets,
            archs: archs
        })
        // Phase 7: Proceed .so files
        print('🔳 Phase 7: Proceed .so files', LogLevel.Verbose)
        await AndroidLibraryProject.proceedSoDependencies(stream, {
            targets: targets,
            arch: archs[0],
            swiftVersion: swiftVersionString
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