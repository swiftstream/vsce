import * as path from 'path'
import { EmbeddedBuildSystem, EmbeddedStream } from '../embeddedStream'
import { buildStatus, isBuildingDebug, LogLevel, print, status, StatusType } from '../../stream'
import { TimeMeasure } from '../../../helpers/timeMeasureHelper'
import { projectDirectory, sidebarTreeView } from '../../../extension'
import { resolveSwiftDependencies } from '../../../commands/build/resolveSwiftDependencies'
import { buildFolderBySystem, defaultBuildShellScript, PreBuildCommandType, Scheme, SchemeBuildConfiguration } from '../../../embeddedStreamConfig'
import { restartLSPCommand } from '../../../commands/restartLSP'
import { isString } from '../../../helpers/isString'

let hasRestartedLSP = false

export async function buildCommand(stream: EmbeddedStream, scheme: Scheme) {
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
    abortHandler.addTaskRunner(stream.buildTaskRunner)
    stream.setBuildingDebug(true)
    sidebarTreeView?.cleanupErrors()
    sidebarTreeView?.refresh()
    const isFresh = !stream.isDebugBuilt(scheme)
    const shouldRestartLSP = !hasRestartedLSP || !isFresh
    const schemeEnv = scheme.env ?? {}
    const buildTypeName = scheme.buildConfiguration === SchemeBuildConfiguration.Debug ? 'debug' : 'release'
    try {
        print({
            normal: `🏗️ Started building ${scheme.title} scheme (${buildTypeName})`,
            detailed: `🏗️ Started building ${scheme.title} scheme (${buildTypeName})`
        }, LogLevel.Normal, true)
        // Phase 1: Pre-Build Action
        if (scheme.preBuild && scheme.preBuild.commands.length > 0) {
            const preBuildEnv = {
                ...schemeEnv,
                ...(scheme.preBuild.env ?? {})
            }
            print('🔳 Phase 1: Executing pre-build action commands', LogLevel.Verbose)
            for (let i = 0; i < scheme.preBuild.commands.length; i++) {
                const item = scheme.preBuild.commands[i]
                if (item.type === PreBuildCommandType.BeforeFreshBuild && !isFresh)
                    continue
                if (await stream.buildTaskRunner.enqueue({
                    label: 'Pre-Building',
                    command: item.command,
                    args: item.args,
                    env: {
                        ...preBuildEnv,
                        ...(item.env ?? {})
                    }
                }) === false) { throw 'Pre-build failed, check terminal for details' }
            }
        } else if (scheme.build.system === EmbeddedBuildSystem.CMake) {
            print({
                verbose: `Phase 1: Executing default pre-build command for CMake`,
                detailed: `Phase 1: Executing default pre-build command for CMake: cmake -B ${buildFolderBySystem(scheme.build.system)} -G Ninja -DUSE_CCACHE=0 .`
            })
            print(`To avoid its execution please declare at least empty "preBuild" section in your scheme`, LogLevel.Verbose)
            if (await stream.buildTaskRunner.enqueue({
                label: 'Building',
                command: 'cmake',
                args: [
                    '-B', buildFolderBySystem(scheme.build.system),
                    '-G', 'Ninja',
                    '-DUSE_CCACHE=0',
                    '.'
                ],
                env: schemeEnv
            }) === false) { return }
        } else {
            print('🔳 Phase 1: Skipped pre-build action', LogLevel.Verbose)
        }
        // Phase 2: Build Action
        const buildEnv = {
            ...schemeEnv,
            ...(scheme.build.env ?? {})
        }
        if (scheme.build.system === EmbeddedBuildSystem.SwiftPM) {
            // Phase 2.1: Resolve Swift dependencies for each build type
            print('🔳 Phase 2.1: Resolve Swift dependencies for each build type', LogLevel.Verbose)
            await resolveSwiftDependencies({
                force: true,
                substatus: (t) => {
                    buildStatus(`Resolving dependencies: ${t}`)
                    print(`🔦 Resolving Swift dependencies ${t}`, LogLevel.Verbose)
                },
                abortHandler: abortHandler
            })
            // Phase 2.2: Retrieve Swift targets
            print('🔳 Phase 2.2: Retrieve Swift targets', LogLevel.Verbose)
            await stream.chooseTarget({ release: false, abortHandler: abortHandler })
            if (!stream.swift.selectedDebugTarget) 
                throw `Please select Swift target to build`
            
            // Phase 2.3: Build executable targets
            print('🔳 Phase 2.3: Build executable targets', LogLevel.Verbose)
            // await buildExecutableTarget({ // TODO: implement SPM build
            //     target: stream.swift.selectedDebugTarget,
            //     mode: buildMode,
            //     release: false,
            //     force: true,
            //     abortHandler: abortHandler
            // })
        } else if (scheme.build.commands && scheme.build.commands.length > 0) {
            print('🔳 Phase 2: Executing build commands', LogLevel.Verbose)
            for (let i = 0; i < scheme.build.commands.length; i++) {
                const item = scheme.build.commands[i]
                if (await stream.buildTaskRunner.enqueue({
                    label: 'Building',
                    command: scheme.build.system == EmbeddedBuildSystem.ShellScript ? path.join(projectDirectory!, item.command) : item.command,
                    args: item.args,
                    env: {
                        ...buildEnv,
                        ...(item.env ?? {})
                    }
                }) === false) { stream.setBuildingDebug(false);return }
            }
        } else {
            print('🔳 Phase 2: Executing build commands', LogLevel.Verbose)
            switch (scheme.build.system) {
                case EmbeddedBuildSystem.CMake:
                    if (await stream.buildTaskRunner.enqueue({
                        label: 'Building',
                        command: 'cmake',
                        args: [ '--build', buildFolderBySystem(scheme.build.system) ],
                        env: buildEnv
                    }) === false) { stream.setBuildingDebug(false);return }
                    break
                case EmbeddedBuildSystem.Makefile:
                    if (await stream.buildTaskRunner.enqueue({
                        label: 'Building',
                        command: 'make',
                        env: buildEnv
                    }) === false) { stream.setBuildingDebug(false);return }
                    break
                case EmbeddedBuildSystem.ShellScript, EmbeddedBuildSystem.Unknown:
                    if (await stream.buildTaskRunner.enqueue({
                        label: 'Building',
                        command: path.join(projectDirectory!, defaultBuildShellScript),
                        env: buildEnv
                    }) === false) { stream.setBuildingDebug(false);return }
                    break
                default:
                    throw '💁‍♂️ Unknown build system'
            }
        }
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
        const text = `Build Failed`
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
