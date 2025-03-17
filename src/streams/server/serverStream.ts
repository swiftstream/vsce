import * as fs from 'fs'
import * as path from 'path'
import { commands, ConfigurationChangeEvent, DebugSession, FileDeleteEvent, FileRenameEvent, TextDocument, TreeItemCollapsibleState, window } from 'vscode'
import { isBuildingDebug, isBuildingRelease, print, Stream } from '../stream'
import { Dependency, SideTreeItem } from '../../sidebarTreeView'
import { defaultServerPort, extensionContext, innerServerPort, isInContainer, projectDirectory, sidebarTreeView } from '../../extension'
import { readServerPortsFromDevContainer } from '../../helpers/readPortsFromDevContainer'
import { serverAttachDebuggerConfig, serverDebugConfig } from '../../helpers/createDebugConfigIfNeeded'
import { Nginx } from './features/nginx'
import { Ngrok } from './features/ngrok'
import { AnyFeature } from '../anyFeature'
import { DevContainerConfig } from '../../devContainerConfig'
import { askToChooseSwiftTargetIfNeeded, buildCommand, chooseDebugTarget, rebuildSwift, selectedSwiftTarget } from './commands/build'
import { buildRelease } from './commands/buildRelease'

export var currentPort: string = `${defaultServerPort}`
export var pendingNewPort: string | undefined

export var isDebugging = false
export var runningDebugTargetPid: number | undefined
export var isRunningDebugTarget = false
export var isRunningReleaseTarget = false

export class ServerStream extends Stream {
    constructor() {
		super()
        
        this._configureServer()
    }

    private _configureServer = async () => {
        const readPorts = await readServerPortsFromDevContainer()
        currentPort = `${readPorts.port ?? defaultServerPort}`
        await Promise.all(this.features().filter(async (x) => await x.isInUse()).map((x) => x.onStartup()))
    }

    async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        super.onDidChangeConfiguration(event)

    }

    async isDebugBuilt(): Promise<boolean> {
        return fs.existsSync(path.join(projectDirectory!, '.build', 'debug', 'App'))
    }
    
    async isReleaseBuilt(): Promise<boolean> {
        return fs.existsSync(path.join(projectDirectory!, '.build', 'release', 'App'))
    }
        
    setPendingNewPort(value: string | undefined) {
        if (!isInContainer() && value) {
            currentPort = value
            pendingNewPort = undefined
        } else {
            pendingNewPort = value
        }
        sidebarTreeView?.refresh()
    }

    registerCommands() {
		super.registerCommands()
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunDebug, async () => { await this.run({ release: false }) }))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunRelease, async () => { await this.run({ release: true }) }))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Port, async () => { await this.changePort() }))
        extensionContext.subscriptions.push(commands.registerCommand('chooseDebugTarget', chooseDebugTarget))
        extensionContext.subscriptions.push(commands.registerCommand('runDebugAttached', async () => { await this.debug() }))
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
            const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
            if (document.languageId === 'jsonc' && document.uri.scheme === 'file') {
                // devcontainer.json
                if (document.uri.path == devContainerPath) {
                    const readPorts = await readServerPortsFromDevContainer()
                    if (readPorts.portPresent && `${readPorts.port}` != currentPort) {
                        this.setPendingNewPort(`${readPorts.port}`)
                    } else {
                        this.setPendingNewPort(undefined)
                    }
                    return true
                }
            }
        }
        return false
    }

    // MARK: Build

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
                placeHolder: `Would you like to build ${selectedSwiftTarget} target?`
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
            if (!selectedSwiftTarget) return
            if (!runningDebugTargetPid) return
            if (!this.checkBinaryExists({ release: false, target: selectedSwiftTarget })) return
            const attachConfig = serverAttachDebuggerConfig({
                target: selectedSwiftTarget,
                pid: runningDebugTargetPid
            })
            await commands.executeCommand('debug.startFromConfig', attachConfig)
            this.setDebugging(attachConfig.name)
            this.isDebugerAttachedLater = true
            sidebarTreeView?.refresh()
            return
        }
        await askToChooseSwiftTargetIfNeeded(this)
        if (!selectedSwiftTarget) 
            throw `Please select Swift target to run`
        if (await this.checkBinaryAndBuildIfNeeded({ release: false, target: selectedSwiftTarget }) === false) return
        const debugConfig = serverDebugConfig({
            target: selectedSwiftTarget,
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
            } else if (this.isAwaitingBuild && isBuildingRelease && selectedSwiftTarget && !this.checkBinaryExists({ release: options.release, target: selectedSwiftTarget })) {
                window.showInformationMessage('Please wait until the build completes')
                return
            }
        } else {
            if (isRunningReleaseTarget) {
                window.showInformationMessage('Please stop the Release build first')
                return
            } else if (this.isAwaitingBuild && isBuildingDebug && selectedSwiftTarget && !this.checkBinaryExists({ release: options.release, target: selectedSwiftTarget })) {
                window.showInformationMessage('Please wait until the build completes')
                return
            }
        }
        await askToChooseSwiftTargetIfNeeded(this)
        if (!selectedSwiftTarget) 
            throw `Please select Swift target to run`
        if (await this.checkBinaryAndBuildIfNeeded({ release: options.release, target: selectedSwiftTarget }) === false) return
        const runningTask = await this.swift.startRunTask({
            release: options.release,
            target: selectedSwiftTarget,
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
            new Dependency(SideTreeItem.BuildDebug, isBuildingDebug || this.isAnyHotBuilding() ? this.isAnyHotBuilding() ? 'Hot Rebuilding' : 'Building' : 'Build', selectedSwiftTarget ? selectedSwiftTarget : '', TreeItemCollapsibleState.None, isBuildingDebug || this.isAnyHotBuilding() ? this.isAnyHotBuilding() ? 'sync~spin::charts.orange' : 'sync~spin::charts.green' : sidebarTreeView!.fileIcon('hammer'))
        ]
    }

    async debugActionItems(): Promise<Dependency[]> {
        return [
            new Dependency(SideTreeItem.RunDebug, this.isAwaitingBuild ? 'Awaiting build' : isDebugging ? 'Debugging' : isRunningDebugTarget ? 'Running' : 'Run', '', TreeItemCollapsibleState.None, this.isAwaitingBuild ? 'sync~spin::charts.orange' : isDebugging ? 'debug-rerun::charts.orange' : isRunningDebugTarget ? 'debug-rerun::charts.green' : 'debug-start'),
            ...(await super.debugActionItems())
        ]
    }
    async releaseItems(): Promise<Dependency[]> {
        return [
            new Dependency(SideTreeItem.RunRelease, isRunningReleaseTarget ? 'Running' : 'Run', '', TreeItemCollapsibleState.None, isRunningReleaseTarget ? 'debug-rerun::charts.green' : 'debug-start'),
            ...(await super.releaseItems())
        ]
    }
    async maintenanceItems(): Promise<Dependency[]> {
        let items: Dependency[] = []
        if (await this.nginx.isInUse()) {

        }
        return [...items, ...(await super.maintenanceItems())]
    }
    async settingsItems(): Promise<Dependency[]> {
        return [
            new Dependency(SideTreeItem.Port, 'Port', `${currentPort} ${pendingNewPort && pendingNewPort != currentPort ? `(${pendingNewPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower'),
            ...(await super.settingsItems())
        ]
    }
            
    setDebugging(debugSessionName?: string | undefined) {
        this.debugSessionName = debugSessionName
        isDebugging = debugSessionName !== undefined
        commands.executeCommand('setContext', 'isDebugging', isDebugging)
    }
            
    setRunningDebugTarget(active: boolean, pid?: number | undefined) {
        isRunningDebugTarget = active
        runningDebugTargetPid = active ? pid : undefined
        commands.executeCommand('setContext', 'isRunningDebugTarget', active)
    }
        
    setRunningReleaseTarget(active: boolean) {
        isRunningReleaseTarget = active
        commands.executeCommand('setContext', 'isRunningReleaseTarget', active)
    }
}