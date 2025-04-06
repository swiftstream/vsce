import { commands, TextDocument, TreeItemCollapsibleState, window } from 'vscode'
import { Dependency, SideTreeItem } from '../../sidebarTreeView'
import { defaultServerPort, extensionContext, innerServerPort, isInContainer, projectDirectory, sidebarTreeView } from '../../extension'
import { readServerPortsFromDevContainer } from '../../helpers/readPortsFromDevContainer'
import { Nginx } from './features/nginx'
import { Ngrok } from './features/ngrok'
import { AnyFeature } from '../anyFeature'
import { DevContainerConfig } from '../../devContainerConfig'
import { PureStream } from '../pure/pureStream'
import { LogLevel, print } from '../stream'

export var currentPort: string = `${defaultServerPort}`
export var pendingNewPort: string | undefined

export class ServerStream extends PureStream {
    public nginx: Nginx
    public ngrok: Ngrok

    constructor(overrideConfigure: boolean = false) {
        super(true)
        this.nginx = new Nginx(this)
        this.ngrok = new Ngrok(this)
        if (!overrideConfigure) this.configure()
    }

    configure() {
        super.configure()
        const readPorts = readServerPortsFromDevContainer()
        currentPort = `${readPorts.port ?? defaultServerPort}`
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
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Port, async () => { await this.changePort() }))
    }
    
    async onDidSaveTextDocument(document: TextDocument): Promise<boolean> {
		if (await super.onDidSaveTextDocument(document)) return true
		if (!isInContainer) return false
        if (document.uri.scheme === 'file') {
            const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
            if (document.languageId === 'jsonc' && document.uri.scheme === 'file') {
                // devcontainer.json
                if (document.uri.path == devContainerPath) {
                    print(`ServerStream detected changes in devcontainer file`, LogLevel.Unbearable)
                    const readPorts = readServerPortsFromDevContainer()
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

    // MARK: Port

    async changePort() {
        const port = await window.showInputBox({
            value: `${pendingNewPort ? pendingNewPort : currentPort}`,
            placeHolder: 'Please select another port for the app',
            validateInput: text => {
                const value = parseInt(text)
                if (value < 80)
                    return 'Should be >= 80'
                if (value > 65534)
                    return 'Should be < 65535'
                return isNaN(parseInt(text)) ? 'Port should be a number' : null
            }
        })
        if (!port) return
        const portToReplace = pendingNewPort ? pendingNewPort : currentPort
        if (port == portToReplace) return
        DevContainerConfig.transaction((c) => c.addOrChangePort(port, `${innerServerPort}`))
        pendingNewPort = port
        sidebarTreeView?.refresh()
    }

    // MARK: Features

	features(): AnyFeature[] {
        return [
            ...super.features(),
            this.nginx,
            this.ngrok
        ]
    }

    // MARK: Side Bar Tree View Items

    async maintenanceItems(): Promise<Dependency[]> {
        let items: Dependency[] = []
        if (this.nginx.isInUse()) {

        }
        return [...items, ...(await super.maintenanceItems())]
    }
    async settingsItems(): Promise<Dependency[]> {
        return [
            new Dependency({
                id: SideTreeItem.Port,
                label: 'Port',
                version: `${currentPort} ${pendingNewPort && pendingNewPort != currentPort ? `(${pendingNewPort} pending reload)` : ''}`,
                icon: 'radio-tower'
            }),
            ...(await super.settingsItems())
        ]
    }
}