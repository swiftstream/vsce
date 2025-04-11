import * as fs from 'fs'
import * as path from 'path'
import { commands, ConfigurationChangeEvent, DebugSession, FileDeleteEvent, FileRenameEvent, TextDocument, window, workspace } from 'vscode'
import { isBuildingDebug, isBuildingRelease, Stream } from '../stream'
import { Dependency, SideTreeItem } from '../../sidebarTreeView'
import { ContextKey, extensionContext, isInContainer, projectDirectory, sidebarTreeView } from '../../extension'
import { AnyFeature } from '../anyFeature'
import { buildCommand, rebuildSwift } from './commands/build'
import { buildRelease } from './commands/buildRelease'
import { pureAttachDebuggerConfig, pureDebugConfig } from '../../helpers/createDebugConfigIfNeeded'
import { env } from 'process'
import { DevContainerConfig } from '../../devContainerConfig'
import { getPureArtifactURLForToolchain } from '../../commands/toolchain'
import { compilationFolder, Swift, SwiftBuildMode } from '../../swift'

export enum PureBuildMode {
	Standard = 'Standard (glibc)',
	StaticLinuxX86 = 'Static Linux (x86-musl)',
	StaticLinuxArm = 'Static Linux (arm-musl)',
}
export function pureBuildModeToSwiftBuildMode(mode: PureBuildMode): SwiftBuildMode {
    const m: string = mode
    return Object.values(SwiftBuildMode).includes(m as SwiftBuildMode) ? m as SwiftBuildMode : SwiftBuildMode.Standard
}
export var debugBuildMode: PureBuildMode = PureBuildMode.Standard
export var releaseBuildMode: PureBuildMode = PureBuildMode.Standard
export var isDebugging = false
export var runningDebugTargetPid: number | undefined
export var isRunningDebugTarget = false
export var isRunningReleaseTarget = false

export class PureStream extends Stream {
    constructor(overrideConfigure: boolean = false) {
        super(true)
        if (!overrideConfigure) this.configure()
    }
    
    configure() {
        super.configure()
        this.setDebugBuildMode()
        this.setReleaseBuildMode()
        const isBuildButtonEnabled = workspace.getConfiguration().get('swift.showTopBuildButton') as boolean
        this.setContext(ContextKey.isNavigationBuildButtonEnabled, isBuildButtonEnabled ?? true)
        const isRunButtonEnabled = workspace.getConfiguration().get('swift.showTopRunButton') as boolean
        this.setContext(ContextKey.isNavigationRunButtonEnabled, isRunButtonEnabled ?? true)
    }

    async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        super.onDidChangeConfiguration(event)
        if (event.affectsConfiguration('swift.debugBuildMode'))
			this.setDebugBuildMode()
        if (event.affectsConfiguration('swift.releaseBuildMode'))
			this.setReleaseBuildMode()
    }
    
    isDebugBuilt(target: string, buildMode: PureBuildMode): boolean {
        return fs.existsSync(compilationFolder({
            target: target,
            mode: pureBuildModeToSwiftBuildMode(buildMode),
            release: false
        }))
    }
    
    isReleaseBuilt(target: string, buildMode: PureBuildMode): boolean {
        return fs.existsSync(compilationFolder({
            target: target,
            mode: pureBuildModeToSwiftBuildMode(buildMode),
            release: true
        }))
    }

    registerCommands() {
        super.registerCommands()
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunDebug, async () => { await this.run({ release: false }) }))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunRelease, async () => { await this.run({ release: true }) }))
        extensionContext.subscriptions.push(commands.registerCommand('runDebugAttached', async () => { await this.debug() }))
        extensionContext.subscriptions.push(commands.registerCommand('runDebugAttachedTopBar', async () => { await this.debug() }))
        extensionContext.subscriptions.push(commands.registerCommand('stopRunningDebug', () => { this.stop() }))
        extensionContext.subscriptions.push(commands.registerCommand('stopRunningRelease', () => { this.stop() }))
        extensionContext.subscriptions.push(commands.registerCommand(this.debugBuildModeElement().id, async () => await this.changeBuildMode({ debug: true }) ))
        extensionContext.subscriptions.push(commands.registerCommand(this.releseBuildModeElement().id, async () => await this.changeBuildMode({ debug: false }) ))
    }

    debugBuildModeElement = () => new Dependency({
        id: SideTreeItem.DebugBuildMode,
        label: 'Mode',
        version: `${debugBuildMode}`,
        tooltip: 'Debug Build Mode',
        icon: 'layout'
    })
    releseBuildModeElement = () => new Dependency({
        id: SideTreeItem.ReleaseBuildMode,
        label: 'Mode',
        version: `${releaseBuildMode}`,
        tooltip: 'Release Build Mode',
        icon: 'layout'
    })
    onDidRenameFiles(event: FileRenameEvent) {
        super.onDidRenameFiles(event)

    }

    onDidDeleteFiles(event: FileDeleteEvent) {
        super.onDidDeleteFiles(event)

    }
        
    async onDidSaveTextDocument(document: TextDocument): Promise<boolean> {
		if (await super.onDidSaveTextDocument(document)) return true
		if (!isInContainer) return false
        if (document.uri.scheme === 'file') {
            for (let i = 0; i < this.features.length; i++) {
                const feature = this.features[i]
                if (await feature.onDidSaveTextDocument(document.uri.path)) {
                    return true
                }
            }
        }
        return false
    }
    
    // MARK: Features

    features(): AnyFeature[] {
        return super.features()
    }
    
    // MARK: Global Keybinding

    async globalKeyRun() {
        await this.debug()
    }

    // MARK: Mode

    setDebugBuildMode(value?: PureBuildMode) {
        debugBuildMode = value ?? workspace.getConfiguration().get('swift.debugBuildMode') as PureBuildMode
        if (value) workspace.getConfiguration().update('swift.debugBuildMode', value)
        sidebarTreeView?.refresh()
    }

    setReleaseBuildMode(value?: PureBuildMode) {
        releaseBuildMode = value ?? workspace.getConfiguration().get('swift.releaseBuildMode') as PureBuildMode
        if (value) workspace.getConfiguration().update('swift.releaseBuildMode', value)
        sidebarTreeView?.refresh()
    }

    async changeBuildMode(params: { debug: boolean }) {
        const standardOption = `${PureBuildMode.Standard}`
        const staticX86Option = `${PureBuildMode.StaticLinuxX86}`
        const staticArmOption = `${PureBuildMode.StaticLinuxArm}`
        switch (await window.showQuickPick([standardOption, staticX86Option, staticArmOption], {
            placeHolder: `Choose ${params.debug ? 'debug' : 'release'} build mode`
        })) {
            case standardOption:
                if (params.debug) debugBuildMode = PureBuildMode.Standard
                else releaseBuildMode = PureBuildMode.Standard
                sidebarTreeView?.refresh()
                break
            case staticX86Option:
                if (!await this.isMuslSDKInstalled()) break
                if (params.debug) debugBuildMode = PureBuildMode.StaticLinuxX86
                else releaseBuildMode = PureBuildMode.StaticLinuxX86
                sidebarTreeView?.refresh()
                break
            case staticArmOption:
                if (!await this.isMuslSDKInstalled()) break
                if (params.debug) debugBuildMode = PureBuildMode.StaticLinuxArm
                else releaseBuildMode = PureBuildMode.StaticLinuxArm
                sidebarTreeView?.refresh()
                break
            default:
                break
        }
    }

    async isMuslSDKInstalled(): Promise<boolean> {
        if (!env.S_ARTIFACT_STATIC_LINUX_URL) {
            const rebuildAction = 'Add and Rebuild the Container'
            switch (await window.showInformationMessage(
                'Static Linux SDK artifact is not installed. Would you like to add it? Rebuilding the container is required.',
                'Add and Rebuild the Container'
            )) {
                case rebuildAction:
                    const artifactUrl = await getPureArtifactURLForToolchain()
                    if (!artifactUrl) {
                        return false
                    }
                    DevContainerConfig.transaction(c => c.setStaticLinuxArtifactURL(artifactUrl))
                    await commands.executeCommand('remote-containers.rebuildContainer')
                    break
                default: break
            }
            return false
        }
        const artifactBaseName = path.basename(env.S_ARTIFACT_STATIC_LINUX_URL)
        const artifactFolder = artifactBaseName.replace(/^swift-/, "")
                                               .replace(/\.artifactbundle\.tar\.gz$/, "")
                                               .replace(/\.artifactbundle\.zip$/, "")
        if (!fs.existsSync(path.join('/root/.swiftpm/swift-sdks', `swift-${artifactFolder}.artifactbundle`))) {
            const rebuildAction = 'Rebuild the Container'
            switch (await window.showInformationMessage(
                `Static Linux SDK artifact haven't been downloaded yet. Rebuilding the container is required.`,
                'Rebuild the Container'
            )) {
                case rebuildAction:
                    await commands.executeCommand('remote-containers.rebuildContainer')
                    break
                default: break
            }
            return false
        }
        return true
    }

    // MARK: Building

    private isAwaitingBuild: boolean = false
    
    async buildDebug() {
        if ([PureBuildMode.StaticLinuxX86, PureBuildMode.StaticLinuxArm].includes(debugBuildMode) && !await this.isMuslSDKInstalled()) {
            const switchToStandardAction = 'Switch to Standard (glibc) build mode'
            switch (await window.showWarningMessage(
                `Static Linux SDK is not installed. Would you like to switch to Standard (glibc) build mode?`,
                switchToStandardAction
            )) {
                case switchToStandardAction:
                    this.setDebugBuildMode(PureBuildMode.Standard)
                    break
                default:
                window.showWarningMessage(`Build debug was cancelled because Static Linux SDK is not installed.`)
                return
            }
        }
		await super.buildDebug()
        await buildCommand(this, debugBuildMode)
    }

    async buildRelease() {
        if ([PureBuildMode.StaticLinuxX86, PureBuildMode.StaticLinuxArm].includes(releaseBuildMode) && !await this.isMuslSDKInstalled()) {
            const switchToStandardAction = 'Switch to Standard (glibc) build mode'
            switch (await window.showWarningMessage(
                `Static Linux SDK is not installed. Would you like to switch to Standard (glibc) build mode?`,
                switchToStandardAction
            )) {
                case switchToStandardAction:
                    this.setReleaseBuildMode(PureBuildMode.Standard)
                    break
                default:
                window.showWarningMessage(`Build release was cancelled because Static Linux SDK is not installed.`)
                return
            }
        }
        await super.buildRelease()
        await buildRelease(this, releaseBuildMode)
    }
    
    async hotRebuildSwift(params?: { target?: string }) {
        await rebuildSwift()
    }

    async abortBuildingDebug() {
        await super.abortBuildingDebug()
        this.isAwaitingBuild = false
        sidebarTreeView?.refresh()
    }

    async abortBuildingRelease() {
        await super.abortBuildingRelease()
        
    }

    // MARK: Debug

    private debugSessionName: string | undefined

    async onDidStartDebugSession(session: DebugSession) {
        if (!projectDirectory) return
        if (session.name === this.debugSessionName) {
            
        }
    }

    async onDidTerminateDebugSession(session: DebugSession) {
        super.onDidTerminateDebugSession(session)
        if (session.name === this.debugSessionName) {
            this.setDebugging()
            if (!this.isDebugerAttachedLater) {
                this.isAwaitingBuild = false
                this.setRunningDebugTarget(false)
                this.setRunningReleaseTarget(false)
            }
            this.isDebugerAttachedLater = false
            sidebarTreeView?.refresh()
        }
    }

    checkBinaryExists(options: {
        release: boolean,
        target: string
    }): boolean {
        return fs.existsSync(path.join(projectDirectory!, '.build', options.release ? 'release' : 'debug', options.target))
    }

    async checkBinaryAndBuildIfNeeded(options: {
        release: boolean,
        target: string
    }): Promise<boolean> {
        if (!this.checkBinaryExists(options)) {
            switch (await window.showQuickPick(['Yes', 'Not now'], {
                placeHolder: `Would you like to build ${this.swift.selectedDebugTarget} target?`
            })) {
                case 'Yes':
                    this.isAwaitingBuild = true
                    sidebarTreeView?.refresh()
                    await this.buildDebug()
                    this.isAwaitingBuild = false
                    sidebarTreeView?.refresh()
                    return true
                default:
                    return false
            }
        }
        return true
    }

    async debug() {
        if (isDebugging) return
        if (isRunningDebugTarget) {
            if (!this.swift.selectedDebugTarget) return
            if (!runningDebugTargetPid) return
            if (!this.checkBinaryExists({ release: false, target: this.swift.selectedDebugTarget })) return
            const attachConfig = pureAttachDebuggerConfig({
                target: this.swift.selectedDebugTarget,
                pid: runningDebugTargetPid
            })
            await commands.executeCommand('debug.startFromConfig', attachConfig)
            this.setDebugging(attachConfig.name)
            this.isDebugerAttachedLater = true
            sidebarTreeView?.refresh()
            return
        }
        await this.swift.askToChooseTargetIfNeeded({ release: false })
        if (!this.swift.selectedDebugTarget) 
            throw `Please select Swift target to run`
        if (await this.checkBinaryAndBuildIfNeeded({ release: false, target: this.swift.selectedDebugTarget }) === false) return
        const debugConfig = pureDebugConfig({
            target: this.swift.selectedDebugTarget,
            args: []
        })
        await commands.executeCommand('debug.startFromConfig', debugConfig)
        this.setRunningDebugTarget(true)
        this.setDebugging(debugConfig.name)
        sidebarTreeView?.refresh()
    }

    // MARK: Run

    async run(options: { release: boolean }) {
        if (isDebugging && !options.release) {
            await commands.executeCommand('workbench.action.debug.restart')
            sidebarTreeView?.refresh()
            return
        }
        if (options.release) {
            if (isRunningDebugTarget) {
                window.showInformationMessage('Please stop the Debug build first')
                return
            } else if (this.isAwaitingBuild && isBuildingRelease && this.swift.selectedDebugTarget && !this.checkBinaryExists({ release: options.release, target: this.swift.selectedDebugTarget })) {
                window.showInformationMessage('Please wait until the build completes')
                return
            }
        } else {
            if (isRunningReleaseTarget) {
                window.showInformationMessage('Please stop the Release build first')
                return
            } else if (this.isAwaitingBuild && isBuildingDebug && this.swift.selectedDebugTarget && !this.checkBinaryExists({ release: options.release, target: this.swift.selectedDebugTarget })) {
                window.showInformationMessage('Please wait until the build completes')
                return
            }
        }
        await this.swift.askToChooseTargetIfNeeded({ release: options.release })
        const selectedTarget = this.swift.selectedTarget({ release: options.release })
        if (!selectedTarget)
            throw `Please select Swift target to run`
        if (await this.checkBinaryAndBuildIfNeeded({ release: options.release, target: selectedTarget }) === false) return
        const runningTask = await this.swift.startRunTask({
            release: options.release,
            target: selectedTarget,
            args: []
        })
        if (options.release) {
            this.setRunningReleaseTarget(true)
        } else {
            this.setRunningDebugTarget(true, runningTask?.pid)
        }
    }

    stop() {
        this.swift.stopRunTask()
        this.setRunningDebugTarget(false)
        this.setRunningReleaseTarget(false)
    }

    // MARK: Side Bar Tree View Items
    
    async defaultDebugActionItems(): Promise<Dependency[]> {
        let items: Dependency[] = []
        if (Swift.v6Mode) items.push(this.debugBuildModeElement())
        return [
            ...items,
            new Dependency({
                id: SideTreeItem.BuildDebug,
                tooltip: 'Cmd+B or Ctrl+B',
                label: isBuildingDebug || this.isAnyHotBuilding() ? this.isAnyHotBuilding() ? 'Hot Rebuilding' : 'Building' : 'Build',
                version: this.swift.selectedDebugTarget ? this.swift.selectedDebugTarget : '',
                icon: isBuildingDebug || this.isAnyHotBuilding() ? this.isAnyHotBuilding() ? 'sync~spin::charts.orange' : 'sync~spin::charts.green' : sidebarTreeView!.fileIcon('hammer')
            })
        ]
    }

    async debugActionItems(): Promise<Dependency[]> {
        return [
            new Dependency({
                id: SideTreeItem.RunDebug,
                tooltip: 'Cmd+R or Ctrl+R',
                label: this.isAwaitingBuild ? 'Awaiting build' : isDebugging ? 'Debugging' : isRunningDebugTarget ? 'Running' : 'Run',
                version: this.swift.selectedDebugTarget ? this.swift.selectedDebugTarget : '',
                icon: this.isAwaitingBuild ? 'sync~spin::charts.orange' : isDebugging ? 'debug-rerun::charts.orange' : isRunningDebugTarget ? 'debug-rerun::charts.green' : 'debug-start'
            }),
            ...(await super.debugActionItems())
        ]
    }
    async debugOptionItems(): Promise<Dependency[]> {
		let items: Dependency[] = []
		await Promise.all(this.features().map(async (feature) => {
            items.push(...(await super.debugOptionItems()))
        }))
		return items
	}
    async defaultReleaseItems(): Promise<Dependency[]> {
        let items: Dependency[] = []
        if (Swift.v6Mode) items.push(this.releseBuildModeElement())
        return [
            ...items,
            ...(await super.defaultReleaseItems())
        ]
    }
    async releaseItems(): Promise<Dependency[]> {
        return [
            new Dependency({
                id: SideTreeItem.RunRelease,
                label: isRunningReleaseTarget ? 'Running' : 'Run',
                version: this.swift.selectedReleaseTarget ? this.swift.selectedReleaseTarget : '',
                icon: isRunningReleaseTarget ? 'debug-rerun::charts.green' : 'debug-start'
            }),
            ...(await super.releaseItems())
        ]
    }
    async maintenanceItems(): Promise<Dependency[]> {
        return await super.maintenanceItems()
    }

    // MARK: Flags
            
    setDebugging(debugSessionName?: string | undefined) {
        this.debugSessionName = debugSessionName
        isDebugging = debugSessionName !== undefined
        this.setContext(ContextKey.isDebugging, isDebugging)
    }
            
    setRunningDebugTarget(active: boolean, pid?: number | undefined) {
        isRunningDebugTarget = active
        runningDebugTargetPid = active ? pid : undefined
        this.setContext(ContextKey.isRunningDebugTarget, active)
    }
        
    setRunningReleaseTarget(active: boolean) {
        isRunningReleaseTarget = active
        this.setContext(ContextKey.isRunningReleaseTarget, active)
    }
}