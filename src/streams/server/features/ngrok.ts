import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { commands, ShellExecution, Task, TaskExecution, TaskProvider, tasks, TaskScope, Terminal, TreeItemCollapsibleState, window } from 'vscode'
import { Dependency } from '../../../sidebarTreeView'
import { ServerStream } from '../serverStream'
import { ServerFeature } from './serverFeature'
import { extensionContext, projectDirectory, sidebarTreeView } from '../../../extension'
import { LogLevel, print } from '../../stream'

export class Ngrok extends ServerFeature {
    constructor(stream: ServerStream) {
        super(
            stream,
            {
                name: 'Ngrok',
                iconFile: 'ngrok',
                featureRepository: 'swiftstream/vsce',
                featureName: 'ngrok-cli', featureVersion: 'latest', featureParams: {},
                configFile: 'ngrok.yml',
                binFolder: '/usr/local/bin',
                binName: 'ngrok'
            }
        )
    }

    registerCommands() {
        super.registerCommands()
        extensionContext.subscriptions.push(commands.registerCommand(this.startMenuItem().id, async () => await this.start() ))
    }
    
    startMenuItem = () => new Dependency({
        id: `Start||${this.name}`,
        label: this.taskProvider?.isRestarting ? 'Restarting' : this.taskProvider?.isRunning ? 'Is running' : 'Start',
        icon: this.taskProvider?.isRestarting ? 'sync~spin::charts.orange' : this.taskProvider?.isRunning ? 'globe::charts.green' : 'globe'
    })

    async featureMenuItems(): Promise<Dependency[]> {
        return [
            ...(await super.featureMenuItems()),
            this.startMenuItem()
        ]
    }

    async onStartup(): Promise<boolean> {
        if (await super.onStartup() == false) return false
        await this.registerStartTaskProvider()
        return true
    }

    async start() {
        if (!this.taskProvider) return
        if (this.taskProvider.isRunning) {
            const showAction = `Show ${this.name} terminal`
            const stopAction = `Stop`
            const restartAction = `Restart`
            switch (await window.showQuickPick([ showAction, stopAction, restartAction ], { placeHolder: `Choose ${this.name} action` })) {
            case showAction:
                this.taskProvider?.reveal()
                break
            case stopAction:
                this.taskProvider?.terminate()
                break
            case restartAction:
                this.taskProvider?.restart()
            default: break
            }
            return
        }
        let config = this.createConfigIfNeeded()
        if (!config.hasToken()) {
            const token = await window.showInputBox({
                value: '',
                placeHolder: 'Please enter ngrok auth token',
                validateInput: text => {
                    if (!text || text.length < 20)
                        return 'Auth token is too short'
                    return null
                }
            })
            if (!token) return
            config.setToken(token)
            config.save()
        }
        print(`🕵️‍♂️ Starting Ngrok`, LogLevel.Verbose)
        if (this.taskProvider) {
            tasks.executeTask(this.taskProvider.task).then(() => {}, (reason) => {
                print(`🕵️‍♂️ Unable to start Ngrok: ${reason}`, LogLevel.Verbose)
            })
        } else {
            print(`🕵️‍♂️ Unable to start Ngrok`, LogLevel.Verbose)
        }
    }

    createConfigIfNeeded(): NgrokConfig {
        let config = new NgrokConfig(this.configPath())
        if (!config.isExistsOnDisk()) {
            config.setToken('')
            config.setRandomAddressEndpoint()
            config.save()
        }
        return config
    }

    projectFeatureFolderPath(): string { return this.devcontainerPath() }

    async copyOriginalConfig() {
        this.createConfigIfNeeded()
    }

    private isRegistered: boolean = false
    private taskProvider?: NgrokStartTaskProvider
    
    private async registerStartTaskProvider() {
        if (!this.isInstalled) {
            return print('🛑 Ngrok not installed', LogLevel.Verbose)
        }
        if (this.isRegistered) return
        this.isRegistered = true
        this.taskProvider = new NgrokStartTaskProvider(this.configPath())
        extensionContext.subscriptions.push(tasks.registerTaskProvider(NgrokStartTaskProvider.StartNgrokType, this.taskProvider))
    }
}

// MARK: Tasks

class NgrokStartTaskProvider implements TaskProvider {
    static StartNgrokType = 'ngrok'
    private taskExecution: TaskExecution | undefined
    private terminal: Terminal | undefined
    private command: string
    isRunning: boolean = false
    isRestarting: boolean = false
    task: Task
    
    constructor(configPath: string) {
        this.command = `/usr/local/bin/ngrok start --config=${configPath} --all`
        this.task = new Task(
            { type: NgrokStartTaskProvider.StartNgrokType },
            TaskScope.Workspace,
            `Run ${NgrokStartTaskProvider.StartNgrokType}`,
            NgrokStartTaskProvider.StartNgrokType,
            new ShellExecution(this.command),
            []
        )
        tasks.onDidStartTaskProcess((e) => {
            if (e.execution.task.name === this.task.name) {
                this.isRestarting = false
                this.isRunning = true
                sidebarTreeView?.refresh()
                this.taskExecution = e.execution
                this.terminal = window.terminals.find((x) => x.name.includes(this.task.name))
            }
        })
        tasks.onDidEndTaskProcess((e) => {
            if (e.execution.task.name === this.task.name) {
                this.isRunning = false
                sidebarTreeView?.refresh()
            }
        })
    }

    public provideTasks(): Task[] | undefined {
        return [this.task]
    }

    public resolveTask(_task: Task): Task | undefined {
        return undefined
    }

    public start() {
        tasks.executeTask(this.task).then(() => {}, (reason) => {
            print(`🕵️‍♂️ Unable to start Ngrok: ${reason}`, LogLevel.Verbose)
        })
    }

    public reveal() {
        this.terminal?.show(true)
    }

    public terminate() {
        if (this.taskExecution) {
            this.taskExecution.terminate()
            this.taskExecution = undefined
        } else if (this.terminal) {
            this.terminal.dispose()
            this.terminal = undefined
        }
    }

    public async restart() {
        this.isRestarting = true
        sidebarTreeView?.refresh()
        this.terminate()
        await new Promise((r) => setTimeout(r, 500))
        this.start()
    }
}

// MARK: Config

export class NgrokConfig {
    public static transaction(path: string, process: (config: NgrokConfig) => void) {
        let config = new NgrokConfig(path)
        process(config)
        config.save()
    }
    
    config: any
    
    constructor(
        private path: string
    ) {
        try {
            this.config = yaml.load(fs.readFileSync(this.path, 'utf8'))
        } catch {
            this.config = { version: 3 }
        }
    }

    public isExistsOnDisk(): boolean {
        return fs.existsSync(this.path)
    }

    public transaction(process: (config: NgrokConfig) => void) {
        process(this)
        this.save()
    }

    public save() {
        const devContainerContent = yaml.dump(this.config)
        fs.writeFileSync(this.path, devContainerContent, 'utf8')
    }

    // MARK: Auth token

    public hasToken(): boolean {
        if (!this.config.agent) return false
        if (!this.config.agent.authtoken) return false
        return true
    }

    public setToken(token: string) {
        if (this.hasToken()) {
            this.config.agent.authtoken = token
        } else {
            this.config.agent = { authtoken: token }
        }
    }

    // MARK: Endpoints

    public hasEndpoints(): boolean {
        if (!this.config.endpoints) return false
        return true
    }

    public setRandomAddressEndpoint() {
        this.config.endpoints = [{
            name: path.basename(projectDirectory ?? ''),
            upstream: { url: 8080 }
        }]
    }
}