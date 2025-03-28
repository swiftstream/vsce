import * as fs from 'fs'
import * as path from 'path'
import { BashError } from '../../../bash'
import { extensionContext, projectDirectory, sidebarTreeView } from '../../../extension'
import { commands, ShellExecution, Task, TaskDefinition, tasks, TaskScope, TreeItemCollapsibleState, window } from 'vscode'
import { WebFeature } from './webFeature'
import { Dependency } from '../../../sidebarTreeView'

export class CloudFeature extends WebFeature {
    isDeploying: boolean = false

    extensionFeatureSourcesPath = () => path.join(extensionContext.extensionPath, 'assets', 'Devcontainer', 'web', 'CloudProviders', this.name)
    projectFeatureFolderPath = () => path.join(projectDirectory!, this.name)

    registerCommands() {
        super.registerCommands()
        extensionContext.subscriptions.push(commands.registerCommand(this.deployMenuItem().id, async () => await this.deploy()))
    }

    requiresSetup(): boolean { return !this.isConfigPresent() }

    deployMenuItem = () => new Dependency(`Deploy||${this.name}`, this.isLoggingIn ? 'Logging in' : this.isDeploying ? 'Deploying' : 'Deploy', '', TreeItemCollapsibleState.None, this.isLoggingIn || this.isDeploying ? 'sync~spin' : 'cloud-upload')

    async deploy(selectedProjectId?: string): Promise<boolean | undefined> {
        throw `Deploy is not implemented for ${this.name}`
    }

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

    // MARK: Projects

    async createProject(id: string): Promise<string | undefined> {
        throw `createProject not implemented for ${this.name}`
    }

    async getListOfProjects(): Promise<any[] | undefined> {
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