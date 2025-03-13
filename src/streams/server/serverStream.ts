import { commands, ConfigurationChangeEvent, DebugSession, FileDeleteEvent, FileRenameEvent, TextDocument, TreeItemCollapsibleState } from 'vscode'
import { LogLevel, print, Stream } from '../stream'
import { Dependency, SideTreeItem } from '../../sidebarTreeView'
import { defaultServerPort, extensionContext, isInContainer, projectDirectory, sidebarTreeView } from '../../extension'
import { readServerPortsFromDevContainer } from '../../helpers/readPortsFromDevContainer'
import { createServerDebugConfigIfNeeded } from '../../helpers/createDebugConfigIfNeeded'
import { DevContainerConfig } from '../../devContainerConfig'

export var currentPort: string = `${defaultServerPort}`
export var pendingNewPort: string | undefined

export var isDebugRunning = false
export var isReleaseRunning = false
export var isRunningNgrok = false

export class ServerStream extends Stream {
    constructor() {
		super()
        
        this._configureServer()
    }

    private _configureServer = async () => {
        const readPorts = await readServerPortsFromDevContainer()
        currentPort = `${readPorts.port ?? defaultServerPort}`
        createServerDebugConfigIfNeeded()
    }
    
    async onDidTerminateDebugSession(session: DebugSession) {
        super.onDidTerminateDebugSession(session)
        if (session.configuration.type.includes('lldb')) {
            this.setDebugRunning(false)
            this.setReleaseRunning(false)
            sidebarTreeView?.refresh()
        }
    }

    async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        super.onDidChangeConfiguration(event)

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
        
    setRunningNgrok(active: boolean) {
        isRunningNgrok = active
    }

    registerCommands() {
		super.registerCommands()
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunDebug, async () => { await this.runDebug() }))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunRelease, async () => { await this.runRelease() }))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.RunNgrok, async () => { await this.runNgrok() }))
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

    // MARK: Building

    async buildDebug() {
        // TODO: 
        print('stream.buildDebug not implemented', LogLevel.Detailed)
    }
    
    async hotRebuildSwift(params?: { target?: string }) {
        // TODO: rebuildSwift(this, params)
    }

    async runDebug() {
        // TODO: 
        print('stream.runDebug not implemented', LogLevel.Detailed)
    }

    async buildRelease(successCallback?: any) {
        // TODO: 
        print('stream.buildRelease not implemented', LogLevel.Detailed)
    }

    async runRelease() {
        // TODO: 
        print('stream.runRelease not implemented', LogLevel.Detailed)
    }

    async runNgrok() {
        // TODO: 
        print('stream.runNgrok not implemented', LogLevel.Detailed)
    }

    // MARK: Side Bar Tree View Items

    async debugActionItems(): Promise<Dependency[]> {
        return [
            new Dependency(SideTreeItem.RunDebug, isDebugRunning ? 'Running' : 'Run', '', TreeItemCollapsibleState.None, isDebugRunning ? 'debug-rerun::charts.green' : 'debug-alt'),
            new Dependency(SideTreeItem.RunNgrok, isRunningNgrok ? 'Ngrok is active' : 'Activate Ngrok', '', TreeItemCollapsibleState.None, isRunningNgrok ? 'globe::charts.green' : 'globe')
        ]
    }
    async debugOptionItems(): Promise<Dependency[]> { return [] }
    async releaseItems(): Promise<Dependency[]> {
        return [
            new Dependency(SideTreeItem.RunRelease, isReleaseRunning ? 'Running' : 'Run', '', TreeItemCollapsibleState.None, isReleaseRunning ? 'debug-stop::charts.green' : 'debug-start'),
        ]
    }
    async projectItems(): Promise<Dependency[]> { return [] }
    async maintenanceItems(): Promise<Dependency[]> { return [] }
    async settingsItems(): Promise<Dependency[]> {
        return [
            new Dependency(SideTreeItem.Port, 'Port', `${currentPort} ${pendingNewPort && pendingNewPort != currentPort ? `(${pendingNewPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower')
        ]
    }
    async isThereAnyRecommendation(): Promise<boolean> { return false }
    async recommendationsItems(): Promise<Dependency[]> { return [] }
    async customItems(element: Dependency): Promise<Dependency[]> { return [] }
            
    setDebugRunning(active: boolean) {
        isDebugRunning = active
        commands.executeCommand('setContext', 'isDebugRunning', active)
    }
        
    setReleaseRunning(active: boolean) {
        isReleaseRunning = active
        commands.executeCommand('setContext', 'isReleaseRunning', active)
    }
}