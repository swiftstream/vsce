import * as fs from 'fs'
import * as path from 'path'
import { commands, ShellExecution, Task, TaskProvider, tasks, TaskScope, TreeItemCollapsibleState, window } from 'vscode'
import { LogLevel, print } from '../../stream'
import { defaultServerNginxPort, extensionContext, innerServerNginxPort, projectDirectory, sidebarTreeView } from '../../../extension'
import { ServerFeature } from './serverFeature'
import { currentPort, pendingNewPort, ServerStream } from '../serverStream'
import { Dependency } from '../../../sidebarTreeView'
import { readServerPortsFromDevContainer } from '../../../helpers/readPortsFromDevContainer'
import { DevContainerConfig } from '../../../devContainerConfig'

export class Nginx extends ServerFeature {
    outerPort: string
    pendingOuterPort: string | undefined

    constructor(stream: ServerStream) {
        super(
            stream,
            {
                name: 'Nginx',
                iconFile: 'nginx',
                iconFileDark: 'nginx-white',
                featureRepository: 'swiftstream/vsce',
                featureName: 'nginx', featureVersion: 'latest', featureParams: {},
                configFile: 'nginx.conf',
                binFolder: '/usr/sbin/nginx',
                binName: 'nginx'
            }
        )
        this.outerPort = `${readServerPortsFromDevContainer().nginxPort ?? defaultServerNginxPort}`
    }

    projectFeatureFolderPath(): string { return this.devcontainerPath() }

    registerCommands(): void {
        super.registerCommands()
        extensionContext.subscriptions.push(commands.registerCommand(this.restartMenuItem().id, async () => await this.restart()))
        extensionContext.subscriptions.push(commands.registerCommand(this.portMenuItem().id, async () => await this.changePort()))
    }
    
    restartMenuItem = () => new Dependency(`Restart||${this.name}`, `Restart ${this.name}`, '', TreeItemCollapsibleState.None, 'refresh')
    portMenuItem = () => new Dependency(`Port||${this.name}`, 'Port', `${this.outerPort} ${this.pendingOuterPort && this.pendingOuterPort != this.outerPort ? `(${this.pendingOuterPort} pending reload)` : ''}`, TreeItemCollapsibleState.None, 'radio-tower')

    async featureMenuItems(): Promise<Dependency[]> {
        return [
            ...(await super.featureMenuItems()),
            this.restartMenuItem(),
            this.portMenuItem()
        ]
    }
    
    private isRegistered: boolean = false
    private isRestarting: boolean = false
    private restartProvider?: NginxRestartTaskProvider

    async onStartup(): Promise<boolean> {
        if (await super.onStartup() == false) return false
        if (await this.isConfigPresent() == false) {
            await this.copyOriginalConfig()
        }
        const ports = readServerPortsFromDevContainer()
        if (!ports.nginxPortPresent) this.setPort(this.outerPort)
        await this.registerRestartTaskProvider()
        await this.restart()
        return true
    }

    async onDidSaveTextDocument(path: string): Promise<boolean> {
        if (path === this.configPath()) {
            await this.restart()
            return true
        }
        return false
    }

    async copyOriginalConfig() {
        this.copyFiles(this.extensionFeatureSourcesPath(), this.projectFeatureFolderPath(), ['nginx.conf'])
        let nginxConf = fs.readFileSync(this.configPath(), 'utf8')
        nginxConf = nginxConf.replace('__PROJECT_NAME__', path.basename(projectDirectory!))
        fs.writeFileSync(this.configPath(), nginxConf)
    }

    async resetConfigToOriginal() {
        if (fs.existsSync(this.configPath()))
            fs.rmSync(this.configPath(), { force: true })
        await this.copyOriginalConfig()
    }

    async integrate() {
        if (await super.integrate() == false) return false
        const ports = readServerPortsFromDevContainer()
        if (!ports.nginxPortPresent) this.setPort(this.outerPort)
        this.copyOriginalConfig()
        this.addMount()
        return true
    }

    async deintegrate() {
        if (await super.deintegrate() == false) return false
        const ports = readServerPortsFromDevContainer()
        if (ports.nginxPortPresent) this.setPort(undefined)
        this.removeConfig()
        this.removeMount()
        return true
    }

    async removePending() {
        await super.removePending()
        const ports = readServerPortsFromDevContainer()
        if (ports.nginxPortPresent) this.setPort(undefined)
        this.removeMount()
    }

    private async registerRestartTaskProvider() {
        if (!this.isInstalled) {
            return print('🛑 Nginx not installed', LogLevel.Verbose)
        }
        if (this.isRegistered) return
        this.isRegistered = true
        this.restartProvider = new NginxRestartTaskProvider()
        extensionContext.subscriptions.push(tasks.registerTaskProvider(NginxRestartTaskProvider.RestartNginxType, this.restartProvider))
        tasks.onDidStartTaskProcess((e) => {
            if (e.execution.task.name === `Restart ${NginxRestartTaskProvider.RestartNginxType}`) {
                this.isRestarting = true
            }
        })
        tasks.onDidEndTaskProcess((e) => {
            if (e.execution.task.name === `Restart ${NginxRestartTaskProvider.RestartNginxType}`) {
                this.isRestarting = false
            }
        })
    }
    
    async restart() {
        if (this.isRestarting) return
        if (!this.restartProvider) return
        print(`🕵️‍♂️ Restarting Nginx`, LogLevel.Verbose)
        if (this.restartProvider) {
            tasks.executeTask(this.restartProvider.task).then(() => {}, (reason) => {
                print(`🕵️‍♂️ Unable to restart Nginx: ${reason}`, LogLevel.Verbose)
            })
        } else {
            print(`🕵️‍♂️ Unable to restart Nginx`, LogLevel.Verbose)
        }
    }

    async changePort() {
        const port = await window.showInputBox({
            value: `${this.pendingOuterPort ? this.pendingOuterPort : this.outerPort}`,
            placeHolder: 'Please select another port for Nginx',
            validateInput: text => {
                const value = parseInt(text)
                if ((pendingNewPort && `${value}` == pendingNewPort) || `${value}` == currentPort)
                    return "Can't set same port as for the app"
                if (value < 80)
                    return 'Should be >= 80'
                if (value > 65534)
                    return 'Should be < 65535'
                return isNaN(parseInt(text)) ? 'Port should be a number' : null
            }
        })
        if (!port) return
        const portToReplace = `${this.pendingOuterPort ? this.pendingOuterPort : this.outerPort}`
        if (port == portToReplace) return
        this.setPort(port)
        this.pendingOuterPort = port
        sidebarTreeView?.refresh()
    }

    setPort(port?: string) {
        DevContainerConfig.transaction((c) => {
            if (port) {
                c.addOrChangePort(port, `${innerServerNginxPort}`)
            } else {
                c.removePort(`${innerServerNginxPort}`)
            }
        })
    }

    private mount = {
        'source': '${localWorkspaceFolder}/.devcontainer/nginx.conf',
        'target': '/etc/nginx/nginx.conf',
        'type': 'bind'
    }

    addMount() {
        DevContainerConfig.transaction((c) => c.addOrChangeMount(this.mount, (m) => m.source === this.mount.source || m.target === this.mount.target))
    }

    removeMount() {
        DevContainerConfig.transaction((c) => c.removeMount((m) => m.source === this.mount.source && m.target === this.mount.target && m.type === this.mount.type))
    }
}

// MARK: Tasks

class NginxRestartTaskProvider implements TaskProvider {
    static RestartNginxType = 'nginx'
    task: Task
    command: string
    
    constructor() {
        this.command = `/etc/init.d/nginx restart || { tail -n 10 /var/log/nginx/error.log; exit 1; }`
        this.task = new Task(
            { type: NginxRestartTaskProvider.RestartNginxType },
            TaskScope.Workspace,
            `Restart ${NginxRestartTaskProvider.RestartNginxType}`,
            NginxRestartTaskProvider.RestartNginxType,
            new ShellExecution(this.command),
            []
        )
    }

    public provideTasks(): Task[] | undefined {
        return [this.task]
    }

    public resolveTask(_task: Task): Task | undefined {
        return undefined
    }
}