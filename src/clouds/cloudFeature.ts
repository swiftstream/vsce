import * as fs from 'fs'
import * as path from 'path'
import { commands, ShellExecution, Task, TaskDefinition, tasks, TaskScope, Terminal, Uri, window, workspace } from 'vscode'
import { extensionContext, projectDirectory, sidebarTreeView } from '../extension'
import { WebStream, buildProdFolder } from '../streams/web/webStream'
import { print } from '../streams/stream'
import { LogLevel } from '../streams/stream'
import { buildReleaseCommand } from '../commands/buildRelease'
import { BashError, BashResult } from '../bash'
import toml from '@iarna/toml'
import JSON5 from 'json5'

export class CloudFeature {
    isInstalled: boolean = false
    isPendingContainerRebuild: boolean = false
    isDeploying: boolean = false
    isLoggingIn: boolean = false
    isDeintegrating: boolean = false
    isDeintegrated: boolean = false

    binPath?: string

    constructor (
        public webStream: WebStream,
        public name: string,
        public featureRepository: string,
        public featureName: string,
        public featureVersion: string,
        private featureParams: any,
        public configFile: string,
        public binName: string,
        private loginCommand: string,
        private logoutCommand: string
    ) {
        this.updateIsInstalled()
    }

    extensionFeatureSourcesPath = () => path.join(extensionContext.extensionPath, 'assets', 'Devcontainer', 'web', 'CloudProviders', this.name)
    projectFeatureFolderPath = () => path.join(projectDirectory!, this.name)

    private devcontainerPath = () => `${projectDirectory}/.devcontainer/devcontainer.json`

    private getDevcontainerConfig = async (): Promise<any> => {
        const devcontainerContent = await workspace.fs.readFile(Uri.file(this.devcontainerPath()))
        return JSON5.parse(devcontainerContent.toString())
    }

    private saveDevcontainerConfig = async (changedConfig: any) => fs.writeFileSync(this.devcontainerPath(), JSON.stringify(changedConfig, null, '\t'))
    
    private repositoryAddress = () => `ghcr.io/${this.featureRepository}/${this.featureName}`

    isPresentInProject = async(): Promise<boolean> => fs.existsSync(path.join(this.projectFeatureFolderPath(), this.configFile))

    getTerminal = (): Terminal => {
        return window.terminals.find((t) => t.name == `${this.name} CLI`) ?? window.createTerminal({
            name: `${this.name} CLI`,
            cwd: path.join(projectDirectory!, this.name)
        })
    }

    private updateIsInstalled = async () => {
        const v = this.webStream.bash.which(this.binName)
        this.isInstalled = v != undefined
        const devcontainerConfig = await this.getDevcontainerConfig()
        var features: any = devcontainerConfig.features ?? {}
        const repo = `${this.repositoryAddress()}:${this.featureVersion}`
        const check = Object.keys(features).find((x) => x.startsWith(repo))
        if (check === undefined) this.isInstalled = false
    }
    
    getDefaultProjectId = () => this.getConfig()?.defaultProjectId
    setDefaultProjectId = (projectId: string) => this.changeConfigKey('defaultProjectId', projectId)

    getNeverAskToSaveProjectAsDefault = () => this.getConfig()?.neverAskToSaveProjectAsDefault == true
    setNeverAskToSaveProjectAsDefault = () => this.changeConfigKey('neverAskToSaveProjectAsDefault', true)
    askToSaveProjectAsDefault = (projectId) => {
        if (this.getNeverAskToSaveProjectAsDefault()) return
        window.showInformationMessage(`Would you like to set ${projectId} project as default?`, 'Yes', 'Never ask again').then((answer) => {
            if (answer == 'Never ask again') {
                this.setNeverAskToSaveProjectAsDefault()
            } else if (answer == 'Yes') {
                this.setDefaultProjectId(projectId)
            }
        })
    }

    isReleaseBuilt = (): boolean => {
        if (!fs.existsSync(path.join(projectDirectory!, buildProdFolder))) {
            window.showWarningMessage(`Make a release build before deploying`, 'Build Release').then((answer) => {
                if (answer == 'Build Release') buildReleaseCommand(() => {
                    return window.showInformationMessage(`Release build succeeded. Continue to Firebase deployment?`, 'Deploy').then((answer) => {
                        if (answer == 'Deploy') this.deploy()
                    })
                })
            })
            return false
        }
        return true
    }

    createProject = async (id: string): Promise<string | undefined> => {
        throw `createProject not implemented for ${this.name}`
    }

    getListOfProjects = async (): Promise<any[] | undefined> => {
        throw `getListOfProjects not implemented for ${this.name}`
    }

    showListOfProjects = async (list: string[]) => {
        const createButton = `Create New ${this.name} Project`
        return new Promise<void>(async (resolve, reject) => {
            try {
                await window.showQuickPick([
                    ...list,
                    createButton
                ], {
                    placeHolder: `Select a project to deploy to`
                }).then((x) => {
                    if (!x) {
                        this.isDeploying = false
                        sidebarTreeView?.refresh()
                        return resolve()
                    }
                    if (x == createButton) {
                        window.showInputBox({ prompt: `Enter New ${this.name} Project ID` }).then(async (projectId) => {
                            if (!projectId) {
                                this.isDeploying = false
                                sidebarTreeView?.refresh()
                                return resolve()
                            }
                            try {
                                const pId = await this.createProject(projectId)
                                this.isDeploying = false
                                sidebarTreeView?.refresh()
                                this.deploy(pId)
                            } catch (error) {
                                console.dir(error)
                                this.isDeploying = false
                                sidebarTreeView?.refresh()
                                reject(error)
                            }
                        })
                    } else {
                        this.isDeploying = false
                        sidebarTreeView?.refresh()
                        this.askToSaveProjectAsDefault(x)
                        this.deploy(x)
                        resolve()
                    }
                })
            } catch (error) {
                reject(error)
            }
        })
    }

    deploy = async (selectedProjectId?: string): Promise<boolean | undefined> => false

    runDeployTask = async (command: string) => {
        const taskName = `${this.name} Deploy`
        const startListener = tasks.onDidStartTask((event) => {
            if (event.execution.task.name === taskName) {
                this.isDeploying = true
                sidebarTreeView?.refresh()
            }
        })
        const endListener = tasks.onDidEndTask((event) => {
            if (event.execution.task.name === taskName) {
                this.isDeploying = false
                sidebarTreeView?.refresh()
                startListener.dispose()
                endListener.dispose()
            }
        })
        const existingTasks = await tasks.fetchTasks()
        const existingTask = existingTasks.find(task => task.name === taskName)
        if (existingTask) return tasks.executeTask(existingTask)
        const taskDefinition: TaskDefinition = {
            type: 'shell',
            label: taskName,
            command: command,
            problemMatcher: []
        }
        const newTask = new Task(
            taskDefinition,
            TaskScope.Workspace,
            taskName,
            'SwiftStream',
            new ShellExecution(taskDefinition.command)
        )
        tasks.executeTask(newTask)
    }

    add = async (): Promise<void> => {
        if (this.isPendingContainerRebuild) {
            const rebuildAction = 'Rebuild the Container'
            const revertAction = `Remove ${this.name} from devcontainer.json`
            switch (await window.showQuickPick([
                rebuildAction,
                revertAction
            ], {
                placeHolder: ``
            })) {
                case rebuildAction:
                    return await commands.executeCommand('remote-containers.rebuildContainer')
                case revertAction:
                    return await this.removePending()
                default: return
            }
        }
        const devcontainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
        const devcontainerContent = await workspace.fs.readFile(Uri.file(devcontainerPath))
        const devcontainerConfig = JSON5.parse(devcontainerContent.toString())
        const repo = this.repositoryAddress()
        var features: any = devcontainerConfig.features ?? {}
        const check = Object.keys(features).find((x) => x.startsWith(repo))
        if (check != undefined) {
            window.showInformationMessage(`${this.name} CLI has already been installed but is not yet available. Please try reloading the window first. If that doesn’t help, please file a bug.`)
            return
        }
        features[`${repo}:${this.featureVersion}`] = this.featureParams
        devcontainerConfig.features = features
        fs.writeFileSync(devcontainerPath, JSON.stringify(devcontainerConfig, null, '\t'))
        if (this.isDeintegrated) {
            this.isDeintegrated = false
            await this.updateIsInstalled()
        } else {
            this.isPendingContainerRebuild = true
            window.showInformationMessage(`${this.name} CLI has been added, please Rebuild the container.`)
        }
        sidebarTreeView?.refresh()
    }

    removePending = async (): Promise<void> => {
        if (this.isInstalled) return
        const devcontainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
        const devcontainerContent = await workspace.fs.readFile(Uri.file(devcontainerPath))
        const devcontainerConfig = JSON5.parse(devcontainerContent.toString())
        const repo = this.repositoryAddress()
        var features: any = devcontainerConfig.features ?? {}
        const check = Object.keys(features).find((x) => x.startsWith(repo))
        if (check != undefined) {
            delete features[check]
            devcontainerConfig.features = features
            this.isPendingContainerRebuild = false
            fs.writeFileSync(devcontainerPath, JSON.stringify(devcontainerConfig, null, '\t'))
            window.showInformationMessage(`${this.name} CLI has been removed from devcontainer.json`)
            sidebarTreeView?.refresh()
        }
    }

    login = async (callback: any) => {
        const taskName = `${this.name} Login`
        const endListener = tasks.onDidEndTask((event) => {
            if (event.execution.task.name === taskName) {
                endListener.dispose()
                callback()
            }
        })
        const existingTasks = await tasks.fetchTasks()
        const existingTask = existingTasks.find(task => task.name === taskName)
        if (existingTask) return tasks.executeTask(existingTask)
        const taskDefinition: TaskDefinition = {
            type: 'shell',
            label: taskName,
            command: `${this.binName} ${this.loginCommand}`,
            problemMatcher: []
        }
        const newTask = new Task(
            taskDefinition,
            TaskScope.Workspace,
            taskName,
            'SwiftStream',
            new ShellExecution(taskDefinition.command)
        )
        tasks.executeTask(newTask)
    }
    
    private logout = async (callback: any) => {
        const taskName = `${this.name} Logout`
        const endListener = tasks.onDidEndTask((event) => {
            if (event.execution.task.name === taskName) {
                endListener.dispose()
                callback()
            }
        })
        const existingTasks = await tasks.fetchTasks()
        const existingTask = existingTasks.find(task => task.name === taskName)
        if (existingTask) return tasks.executeTask(existingTask)
        const taskDefinition: TaskDefinition = {
            type: 'shell',
            label: taskName,
            command: `${this.binName} ${this.logoutCommand}`,
            problemMatcher: []
        }
        const newTask = new Task(
            taskDefinition,
            TaskScope.Workspace,
            taskName,
            'SwiftStream',
            new ShellExecution(taskDefinition.command)
        )
        tasks.executeTask(newTask)
    }

    deintegrate = async () => {
        if (this.isDeintegrating) return
        this.isDeintegrating = true
        sidebarTreeView?.refresh()
        const answer = await window.showWarningMessage(`Are you sure you want to deintegrate ${this.name} from the project? This will completely delete the ${this.name} folder and prompt you to rebuild the container afterward.`, 'Yes, deintegrate')
        if (answer != 'Yes, deintegrate') {
            this.isDeintegrating = false
            sidebarTreeView?.refresh()
            return
        }
        const removeFiles = () => {
            fs.rmSync(path.join(projectDirectory!, this.name), { recursive: true, force: true })
        }
        this.logout(async () => {
            removeFiles()
            const devcontainerConfig = await this.getDevcontainerConfig()
            const repo = this.repositoryAddress()
            var features: any = devcontainerConfig.features ?? {}
            const check = Object.keys(features).find((x) => x.startsWith(repo))
            if (check != undefined) {
                delete features[check]
                devcontainerConfig.features = features
                if (Object.keys(devcontainerConfig.features).length == 0) {
                    delete devcontainerConfig.features
                }
                this.saveDevcontainerConfig(devcontainerConfig)
                window.showInformationMessage(`${this.name} has been deintegrated, please Rebuild the container.`)
            }
            await this.updateIsInstalled()
            this.isDeintegrating = false
            this.isDeintegrated = true
            sidebarTreeView?.refresh()
        })
    }

    execute = async (args: string[], cwd: string): Promise<BashResult> => {
        if (!this.binPath)
            this.binPath = await this.webStream.bash.which(this.binName)
        if (!this.binPath)
            throw `Path to ${this.binName} is undefined`
        print(`executing ${this.binName} ${args.join(' ')}`, LogLevel.Verbose)
        var env = process.env
        env.VSCODE_CWD = ''
        const result = await this.webStream.bash.execute({
            path: this.binPath!,
            description: this.name,
            cwd: cwd,
            env: env,
            isCancelled: () => false
        }, args)
        return result
    }

    // MARK: Helpers

    askForAuthentication = () => {
        window.showWarningMessage(`${this.name} authentication is required`, 'Proceed to login').then(async (arg) => {
            if (arg == 'Proceed to login') {
                this.isLoggingIn = true
                sidebarTreeView?.refresh()
                await this.login(() => {
                    this.isLoggingIn = false
                    sidebarTreeView?.refresh()
                })
            }
        })
    }

    processDeployError = (error: any): { bashError: BashError | undefined, fallback: () => void } => {
        if (error instanceof BashError) {
            this.isDeploying = false
            sidebarTreeView?.refresh()
            return {
                bashError: error,
                fallback: () => {
                    console.dir(error)
                    window.showErrorMessage(`Something went wrong. (check console for error details)`)
                }
            }
        } else {
            this.isDeploying = false
            sidebarTreeView?.refresh()
            console.dir(error)
            return {
                bashError: undefined,
                fallback: () => {
                    window.showErrorMessage(`Something went wrong. (check console for error details)`)
                }
            }
        }
    }

    getConfig = (configFile?: string): any | undefined => {
        const configPath = path.join(this.projectFeatureFolderPath(), configFile ?? this.configFile)
        if (!fs.existsSync(configPath)) return undefined
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return undefined
        if (path.extname(configPath) == '.toml') return toml.parse(configString)
        else return JSON.parse(configString)
    }

    changeConfig = (processor: (config: any) => any, configFile?: string) => {
        const configPath = path.join(this.projectFeatureFolderPath(), configFile ?? this.configFile)
        if (!fs.existsSync(configPath)) {
            if (path.extname(configPath) == '.toml') fs.writeFileSync(configPath, toml.stringify({}))
            else fs.writeFileSync(configPath, JSON.stringify({}, null, '\t'))
        }
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return
        let config: any | undefined = undefined
        if (path.extname(configPath) == '.toml') config = toml.parse(configString)
        else config = JSON.parse(configString)
        if (!config) return
        const processorResult = processor(config)
        if (!processorResult) return
        if (path.extname(configPath) == '.toml') return fs.writeFileSync(configPath, toml.stringify(processorResult))
        else fs.writeFileSync(configPath, JSON.stringify(processorResult, null, '\t'))
    }

    changeConfigKey = (key: string, value: any, configFile?: string) => { this.changeConfig((config) => { config[key] = value; return config }, configFile) }

    copyFiles = (sourceFolder, destFolder, files) => {
        if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder)
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            fs.cpSync(
                path.join(sourceFolder, file),
                path.join(destFolder, file),
                { force: true }
            )
        }
    }

    makeExecutable = (filePath: string) => {
        try {
            fs.chmodSync(filePath, 0o755)
        } catch (error) {
            console.error(`Failed to make ${filePath} executable:`, error)
        }
    }
}