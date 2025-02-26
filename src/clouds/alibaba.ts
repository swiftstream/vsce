import * as fs from 'fs'
import * as path from 'path'
import JSON5 from 'json5'
import { BashError, BashResult } from '../bash'
import { buildProdFolder, indexFile, WebStream } from '../streams/web/webStream'
import { print } from '../streams/stream'
import { LogLevel } from '../streams/stream'
import { currentStream, extensionContext, projectDirectory, sidebarTreeView } from '../extension'
import { ProgressLocation, ShellExecution, Task, TaskDefinition, tasks, TaskScope, Terminal, Uri, window, workspace } from 'vscode'

export class Alibaba {
    private binPath?: string
    public isInstalled: boolean = false

    constructor(private webStream: WebStream) {
        this.updateIsInstalled()
    }

    private updateIsInstalled = async () => {
        const v = this.webStream.bash.which('firebase')
        this.isInstalled = v != undefined
        const devcontainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
        const devcontainerContent = await workspace.fs.readFile(Uri.file(devcontainerPath))
        const devcontainerConfig = JSON5.parse(devcontainerContent.toString())
        const repo = 'ghcr.io/swiftstream/vsce/alibaba-cli:latest'
        var features: any = devcontainerConfig.features ?? {}
        const check = Object.keys(features).find((x) => x.startsWith(repo))
        if (check === undefined) {
            this.isInstalled = false
        }
    }

    private getTerminal(): Terminal {
        return window.terminals.find((t) => t.name == 'Firebase CLI') ?? window.createTerminal({
            name: 'Firebase CLI',
            cwd: path.join(projectDirectory!, 'Firebase')
        })
    }

    async isPresentInProject(): Promise<boolean> {
        return fs.existsSync(path.join(projectDirectory!, 'Firebase', 'firebase.json'))
    }

    async add() {
        const devcontainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
        const devcontainerContent = await workspace.fs.readFile(Uri.file(devcontainerPath))
        const devcontainerConfig = JSON5.parse(devcontainerContent.toString())
        const repo = 'ghcr.io/swiftstream/vsce/alibaba-cli:latest'
        var features: any = devcontainerConfig.features ?? {}
        const check = Object.keys(features).find((x) => x.startsWith(repo))
        if (check != undefined) {
            return window.showInformationMessage(`Firebase CLI has already been installed but is not yet available. Please try reloading the window first. If that doesn’t help, please file a bug.`)
        }
        features[`${repo}:2`] = {
            version: 'latest',
            install: '${FIREBASE_CLI:-false}'
        }
        devcontainerConfig.features = features
        fs.writeFileSync(devcontainerPath, JSON.stringify(devcontainerConfig, null, '\t'))
        window.showInformationMessage(`Firebase CLI has been added, please Rebuild the container.`)
    }

    async setup() {
        const extensionPath = extensionContext.extensionPath
        const sourceFolderPath = path.join(extensionPath, 'assets', 'Devcontainer', 'web', 'CloudProviders', 'Firebase')
        const destinationFolderPath = path.join(projectDirectory!, 'Firebase')
        function copyFiles(sourceFolder, destFolder, files) {
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
        function makeExecutable(filePath: string) {
            try {
                fs.chmodSync(filePath, 0o755)
            } catch (error) {
                console.error(`Failed to make ${filePath} executable:`, error)
            }
        }
        copyFiles(sourceFolderPath, destinationFolderPath, ['firebase.json', '.gitignore'])
        copyFiles(path.join(sourceFolderPath, 'functions'), path.join(destinationFolderPath, 'functions'), ['package.json', 'index.js', 'predeploy.sh', '.gitignore'])
        makeExecutable(path.join(projectDirectory!, 'Firebase', 'functions', 'predeploy.sh'))
        if (!fs.existsSync(path.join(projectDirectory!, buildProdFolder))) {
            fs.mkdirSync(path.join(projectDirectory!, buildProdFolder))
        }
        fs.symlinkSync(path.join(projectDirectory!, buildProdFolder), path.join(projectDirectory!, 'Firebase', 'public'))
        window.showInformationMessage(`Firebase files has been added`)
        sidebarTreeView?.refresh()
    }

    private getDefaultProjectId(): string | undefined {
        const configPath = path.join(projectDirectory!, 'Firebase', '.firebaserc')
        if (!fs.existsSync(configPath)) return undefined
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return undefined
        return JSON.parse(configString)?.projects?.default
    }

    private setDefaultProjectId(projectId: string) {
        const configPath = path.join(projectDirectory!, 'Firebase', '.firebaserc')
        if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, '{}')
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return
        var config = JSON.parse(configString)
        if (!config.projects) config.projects = {}
        config.projects.default = projectId
        fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'))
    }

    private getNeverAskToSaveProjectAsDefault(): boolean | undefined {
        const configPath = path.join(projectDirectory!, 'Firebase', '.firebaserc')
        if (!fs.existsSync(configPath)) return undefined
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return undefined
        return JSON.parse(configString)?.neverAskToSaveProjectAsDefault == true
    }

    private setNeverAskToSaveProjectAsDefault() {
        const configPath = path.join(projectDirectory!, 'Firebase', '.firebaserc')
        if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, '{}')
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return
        var config = JSON.parse(configString)
        config.neverAskToSaveProjectAsDefault = true
        fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'))
    }

    private setHostingRewrites(full: boolean) {
        const configPath = path.join(projectDirectory!, 'Firebase', 'firebase.json')
        if (!fs.existsSync(configPath)) return window.showWarningMessage(`Unable to update hosing.rewrites value in firebase.json`)
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return window.showWarningMessage(`Unable to update hosing.rewrites value in firebase.json`)
        var config = JSON.parse(configString)
        var rewrites: any[] = config.hosting.rewrites
        const indexToDelete = rewrites.findIndex((x) => x.source == '/**')
        if (indexToDelete >= 0) rewrites.splice(indexToDelete, 1)
        if (full) {
            rewrites.push({
                "source": "/**",
                "function": "renderHtml"
            })
        } else {
            rewrites.push({
                "source": "/**",
                "destination": `/${indexFile}`
            })
        }
        config.hosting.rewrites = rewrites
        fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'))
    }

    getFullDeployMode(): boolean | undefined {
        const configPath = path.join(projectDirectory!, 'Firebase', '.firebaserc')
        if (!fs.existsSync(configPath)) return undefined
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return undefined
        return JSON.parse(configString)?.fullDeployMode == true
    }

    setFullDeployMode(value: boolean) {
        const configPath = path.join(projectDirectory!, 'Firebase', '.firebaserc')
        if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, '{}')
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return
        var config = JSON.parse(configString)
        config.fullDeployMode = value
        fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'))
    }

    private askToSaveProjectAsDefault = (projectId) => {
        if (this.getNeverAskToSaveProjectAsDefault()) return
        window.showInformationMessage(`Would you like to set ${projectId} project as default?`, 'Yes', 'Never ask again').then((answer) => {
            if (answer == 'Never ask again') {
                this.setNeverAskToSaveProjectAsDefault()
            } else if (answer == 'Yes') {
                this.setDefaultProjectId(projectId)
            }
        })
    }

    changeDeployMode = async (): Promise<boolean | undefined> => {
        const answer = await window.showQuickPick([
            'Full Deploy (cloud function for search engines)',
            'Only hosting (invisible for search engines)'
        ], {
            placeHolder: `Select deploy mode`
        })
        if (!answer) return undefined
        const value = answer.includes('Full')
        this.setFullDeployMode(value)
        this.setHostingRewrites(value)
        sidebarTreeView?.refresh()
        return value
    }

    isDeploying = false
    isLoggingIn = false

    deploy = async (selectedProjectId?: string) => {
        if (this.isDeploying) return false
        if (!fs.existsSync(path.join(projectDirectory!, buildProdFolder))) {
            return window.showWarningMessage(`Make a release build before deploying`, 'Build Release').then((answer) => {
                if (answer == 'Build Release') currentStream?.buildRelease(() => {
                    return window.showInformationMessage(`Release build succeeded. Continue to Firebase deployment?`, 'Deploy').then((answer) => {
                        if (answer == 'Deploy') this.deploy()
                    })
                })
            })
        }
        this.isDeploying = true
        sidebarTreeView?.refresh()
        window.withProgress({
            location: ProgressLocation.Notification,
            title: 'Please wait...',
            cancellable: false
        }, async (progress, token) => {
            try {
                if (!selectedProjectId) selectedProjectId = this.getDefaultProjectId()
                if (!selectedProjectId) {
                    const listResponse = await this.execute(['projects:list', '--json'], path.join(projectDirectory!, 'Firebase'))
                    if (!listResponse.stdout) throw 'Unable to get list of projects'
                    const response = JSON.parse(listResponse.stdout)
                    if (response.status != 'success') throw 'Unable to get list of projects'
                    const list: any[] = response.result
                    window.showQuickPick([
                        ...(list.map((p) => p.projectId)),
                        'Create New Firebase Project'
                    ], {
                        placeHolder: `Select a project to deploy to`
                    }).then((x) => {
                        if (!x) {
                            this.isDeploying = false
                            sidebarTreeView?.refresh()
                            return
                        }
                        if (x == 'Create New Firebase Project') {
                            window.showInputBox({ prompt: 'Enter New Firebase Project ID' }).then((projectId) => {
                                if (!projectId) {
                                    this.isDeploying = false
                                    sidebarTreeView?.refresh()
                                    return
                                }
                                window.withProgress({
                                    location: ProgressLocation.Notification,
                                    title: 'Please wait...',
                                    cancellable: false
                                }, async (progress, token) => {
                                    const pId = await this.createProject(projectId)
                                    this.isDeploying = false
                                    sidebarTreeView?.refresh()
                                    this.deploy(pId)
                                })
                            })
                        } else {
                            this.isDeploying = false
                            sidebarTreeView?.refresh()
                            this.askToSaveProjectAsDefault(x)
                            this.deploy(x)
                        }
                    })
                } else {
                    let isFullDeployMode = this.getFullDeployMode()
                    if (isFullDeployMode === undefined) {
                        let modeAnswer = await this.changeDeployMode()
                        if (modeAnswer === undefined) {
                            this.isDeploying = false
                            sidebarTreeView?.refresh()
                            return
                        }
                        isFullDeployMode = modeAnswer
                    }
                    const what = isFullDeployMode ? 'functions,hosting' : 'hosting'
                    const taskName = 'Firebase Deploy'
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
                    const commands = [
                        `cd ${path.join(projectDirectory!, 'Firebase', 'functions')}`,
                        'npm install',
                        `cd ${path.join(projectDirectory!, 'Firebase')}`,
                        `firebase deploy --only ${what} --project ${selectedProjectId}`
                    ]
                    const taskDefinition: TaskDefinition = {
                        type: 'shell',
                        label: taskName,
                        command: commands.join(' && '),
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
            } catch (error) {
                if (error instanceof BashError) {
                    if (error.code == 1 && error.stdout?.includes('authenticate') == true) {
                        window.showWarningMessage('Firebase authentication is required', 'Proceed to login').then(async (arg) => {
                            if (!arg) {
                                this.isDeploying = false
                                sidebarTreeView?.refresh()
                            } else if (arg == 'Proceed to login') {
                                this.isLoggingIn = true
                                sidebarTreeView?.refresh()
                                await this.login(() => {
                                    this.isDeploying = false
                                    this.isLoggingIn = false
                                    sidebarTreeView?.refresh()
                                })
                            }
                        })
                    } else {
                        this.isDeploying = false
                        sidebarTreeView?.refresh()
                        window.showErrorMessage(`Something went wrong. Please check that you have Firebase/.firebaserc file and you are authenticated. (check console for error details)`)
                    }
                } else {
                    this.isDeploying = false
                    sidebarTreeView?.refresh()
                    window.showErrorMessage(`Something went wrong. Please check that you have Firebase/.firebaserc file and you are authenticated. (check console for error details)`)
                }
                console.dir(error)
            }
        })
    }

    private login = async (callback: any) => {
        const taskName = 'Firebase Login'
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
            command: `firebase login --reauth`,
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
        const taskName = 'Firebase Logout'
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
            command: `firebase logout`,
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

    private createProject = async (id: string): Promise<string | undefined> => {
        const createResponse = await this.execute(['projects:create', id, '--display-name', `"${id}"`, '--json'], path.join(projectDirectory!, 'Firebase'))
        if (!createResponse.stdout) {
            window.showErrorMessage('Unable to create project')
            return undefined
        }
        const response = JSON.parse(createResponse.stdout)
        if (response.status != 'success') {
            window.showErrorMessage('Unable to create project')
            return undefined
        }
        return response.result.projectId
    }

    private execute = async (args: string[], cwd: string): Promise<BashResult> => {
        if (!this.binPath)
            this.binPath = await this.webStream.bash.which('firebase')
        if (!this.binPath)
            throw 'Path to firebase is undefined'
        print(`executing firebase ${args.join(' ')}`, LogLevel.Verbose)
        var env = process.env
        env.VSCODE_CWD = ''
        const result = await this.webStream.bash.execute({
            path: this.binPath!,
            description: `firebase`,
            cwd: cwd,
            env: env,
            isCancelled: () => false
        }, args)
        return result
    }

    isDeintegrating = false

    deintegrate = async () => {
        if (this.isDeintegrating) return
        this.isDeintegrating = true
        sidebarTreeView?.refresh()
        const answer = await window.showWarningMessage(`Are you sure you want to deintegrate Firebase from the project? This will completely delete the Firebase folder and prompt you to rebuild the container afterward.`, 'Yes, deintegrate')
        if (answer != 'Yes, deintegrate') {
            this.isDeintegrating = false
            sidebarTreeView?.refresh()
            return
        }
        this.logout(async () => {
            fs.rmSync(path.join(projectDirectory!, 'Firebase'), { recursive: true, force: true })
            const devcontainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
            const devcontainerContent = await workspace.fs.readFile(Uri.file(devcontainerPath))
            const devcontainerConfig = JSON5.parse(devcontainerContent.toString())
            const repo = 'ghcr.io/devcontainers-contrib/features/firebase-cli'
            var features: any = devcontainerConfig.features ?? {}
            const check = Object.keys(features).find((x) => x.startsWith(repo))
            if (check != undefined) {
                delete features[check]
                devcontainerConfig.features = features
                if (Object.keys(devcontainerConfig.features).length == 0) {
                    delete devcontainerConfig.features
                }
                fs.writeFileSync(devcontainerPath, JSON.stringify(devcontainerConfig, null, '\t'))
                window.showInformationMessage(`Firebase has been deintegrated, please Rebuild the container.`)
            }
            await this.updateIsInstalled()
            this.isDeintegrating = false
            sidebarTreeView?.refresh()
        })
    }
}