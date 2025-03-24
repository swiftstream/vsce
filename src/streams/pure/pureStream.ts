import * as fs from 'fs'
import * as path from 'path'
import { commands, ConfigurationChangeEvent, DebugSession, FileDeleteEvent, FileRenameEvent, TextDocument, TreeItemCollapsibleState, window, workspace } from 'vscode'
import { isBuildingDebug, isBuildingRelease, Stream } from '../stream'
import { Dependency, SideTreeItem } from '../../sidebarTreeView'
import { ContextKey, extensionContext, isInContainer, projectDirectory, sidebarTreeView } from '../../extension'
import { AnyFeature } from '../anyFeature'
import { buildCommand, rebuildSwift } from './commands/build'
import { buildRelease } from './commands/buildRelease'
import { pureAttachDebuggerConfig, pureDebugConfig } from '../../helpers/createDebugConfigIfNeeded'

export var isDebugging = false
export var runningDebugTargetPid: number | undefined
export var isRunningDebugTarget = false
export var isRunningReleaseTarget = false

export class PureStream extends Stream {
    constructor() {
        super()

        this._configurePure()
    }

    private _configurePure = async () => {
        const isBuildButtonEnabled = workspace.getConfiguration().get('swift.showTopBuildButton') as boolean
        this.setContext(ContextKey.isNavigationBuildButtonEnabled, isBuildButtonEnabled ?? true)
        const isRunButtonEnabled = workspace.getConfiguration().get('swift.showTopRunButton') as boolean
        this.setContext(ContextKey.isNavigationRunButtonEnabled, isRunButtonEnabled ?? true)
    }

    async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        super.onDidChangeConfiguration(event)

    }
    
    async isDebugBuilt(target: string): Promise<boolean> {
        return fs.existsSync(path.join(projectDirectory!, '.build', 'debug', target))
    }
    
    async isReleaseBuilt(target: string): Promise<boolean> {
        return fs.existsSync(path.join(projectDirectory!, '.build', 'release', target))
    }

    registerCommands() {
        super.registerCommands()
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunDebug, async () => { await this.run({ release: false }) }))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunRelease, async () => { await this.run({ release: true }) }))
        extensionContext.subscriptions.push(commands.registerCommand('runDebugAttached', async () => { await this.debug() }))
        extensionContext.subscriptions.push(commands.registerCommand('runDebugAttachedTopBar', async () => { await this.debug() }))
        extensionContext.subscriptions.push(commands.registerCommand('stopRunningDebug', () => { this.stop() }))
        extensionContext.subscriptions.push(commands.registerCommand('stopRunningRelease', () => { this.stop() }))
    }

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

    // MARK: Building

    private isAwaitingBuild: boolean = false
    
    async buildDebug() {
        await buildCommand(this)
    }

    async buildRelease() {
        await buildRelease(this)
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
        if (isDebugging) {
            sidebarTreeView?.refresh()
            await commands.executeCommand('workbench.action.debug.restart')
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
        if (!this.swift.selectedDebugTarget) 
            throw `Please select Swift target to run`
        if (await this.checkBinaryAndBuildIfNeeded({ release: options.release, target: this.swift.selectedDebugTarget }) === false) return
        const runningTask = await this.swift.startRunTask({
            release: options.release,
            target: this.swift.selectedDebugTarget,
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
        return [
            new Dependency(SideTreeItem.BuildDebug, isBuildingDebug || this.isAnyHotBuilding() ? this.isAnyHotBuilding() ? 'Hot Rebuilding' : 'Building' : 'Build', this.swift.selectedDebugTarget ? this.swift.selectedDebugTarget : '', TreeItemCollapsibleState.None, isBuildingDebug || this.isAnyHotBuilding() ? this.isAnyHotBuilding() ? 'sync~spin::charts.orange' : 'sync~spin::charts.green' : sidebarTreeView!.fileIcon('hammer'))
        ]
    }

    async debugActionItems(): Promise<Dependency[]> {
        return [
            new Dependency(SideTreeItem.RunDebug, this.isAwaitingBuild ? 'Awaiting build' : isDebugging ? 'Debugging' : isRunningDebugTarget ? 'Running' : 'Run', this.swift.selectedDebugTarget ? this.swift.selectedDebugTarget : '', TreeItemCollapsibleState.None, this.isAwaitingBuild ? 'sync~spin::charts.orange' : isDebugging ? 'debug-rerun::charts.orange' : isRunningDebugTarget ? 'debug-rerun::charts.green' : 'debug-start'),
            ...(await super.debugActionItems())
        ]
    }
    async releaseItems(): Promise<Dependency[]> {
        return [
            new Dependency(SideTreeItem.RunRelease, isRunningReleaseTarget ? 'Running' : 'Run', this.swift.selectedReleaseTarget ? this.swift.selectedReleaseTarget : '', TreeItemCollapsibleState.None, isRunningReleaseTarget ? 'debug-rerun::charts.green' : 'debug-start'),
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