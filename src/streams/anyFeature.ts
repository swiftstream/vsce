import * as fs from 'fs'
import * as path from 'path'
import JSON5 from 'json5'
import toml from '@iarna/toml'
import { commands, ShellExecution, Task, TaskDefinition, tasks, TaskScope, Terminal, TreeItemCollapsibleState, window } from 'vscode'
import { extensionContext, projectDirectory, sidebarTreeView } from '../extension'
import { Bash, BashResult } from '../bash'
import { print, LogLevel } from './stream'
import { Dependency } from '../sidebarTreeView'
import { openDocumentInEditor } from '../helpers/openDocumentInEditor'
import { DevContainerConfig } from '../devContainerConfig'

export class AnyFeature {
    isInstalled: boolean = false
    isPendingContainerRebuild: boolean = false
    isLoggingIn: boolean = false
    isDeintegrating: boolean = false
    isDeintegrated: boolean = false

    binPath: string

    constructor (
        private bash: Bash,
        public name: string,
        public iconFile: string,
        public iconFileDark: string | undefined,
        public featureRepository: string,
        public featureName: string,
        public featureVersion: string,
        public featureParams: any,
        public configFile: string | undefined,
        binFolder: string,
        public binName: string,
        private loginCommand?: string,
        private logoutCommand?: string
    ) {
        this.binPath = path.join(binFolder, binName)
        this.updateIsInstalled()
    }

    extensionFeatureSourcesPath(): string {
        throw `extensionFeatureSourcesPath is not implemented for ${this.name}`
    }
    projectFeatureFolderPath(): string { return path.join(projectDirectory!, this.name) }
    devcontainerPath = () => `${projectDirectory}/.devcontainer`
    devcontainerJsonPath = () => `${this.devcontainerPath()}/devcontainer.json`

    getDevcontainerConfig = (): any => {
        const devcontainerContent = fs.readFileSync(this.devcontainerJsonPath(), 'utf8')
        return JSON5.parse(devcontainerContent.toString())
    }

    saveDevcontainerConfig = async (changedConfig: any) => fs.writeFileSync(this.devcontainerJsonPath(), JSON.stringify(changedConfig, null, '\t'))
    
    repositoryAddress = () => `ghcr.io/${this.featureRepository}/${this.featureName}`

    isBinaryPresent = (): boolean => fs.existsSync(this.binPath)
    isConfigPresent = (): boolean => this.configFile ? fs.existsSync(path.join(this.projectFeatureFolderPath(), this.configFile)) : false

    isInUse(): boolean {
        if (!this.isInstalled) return false
        if (this.isDeintegrated) return false
        if (this.isPendingContainerRebuild) return false
        if (!this.isBinaryPresent()) return false
        return true
    }

    getTerminal = (): Terminal => {
        return window.terminals.find((t) => t.name == `${this.name} CLI`) ?? window.createTerminal({
            name: `${this.name} CLI`,
            cwd: path.join(projectDirectory!, this.name)
        })
    }

    registerCommands() {
        extensionContext.subscriptions.push(commands.registerCommand(this.name, () => {}))
        extensionContext.subscriptions.push(commands.registerCommand(this.integrateMenuElement().id, async () => await this.integrate()))
        extensionContext.subscriptions.push(commands.registerCommand(this.setupMenuElement().id, async () => await this.setup()))
        extensionContext.subscriptions.push(commands.registerCommand(this.deintegrateMenuElement().id, async () => await this.deintegrate()))
        extensionContext.subscriptions.push(commands.registerCommand(this.editConfigMenuItem().id, async () => await this.openConfigInEditor()))
    }

    installedMenuElement = () => new Dependency({
        id: this.name,
        label: this.name,
        state: TreeItemCollapsibleState.Collapsed,
        icon: sidebarTreeView!.fileIcon(this.iconFile, this.iconFileDark)
    })
    collectionMenuElement = () => new Dependency({
        id: this.name,
        label: this.name,
        icon: sidebarTreeView!.fileIcon(this.iconFile, this.iconFileDark)
    })
    integrateMenuElement = () => new Dependency({
        id: `Integrate||${this.name}`,
        label: this.name,
        version: this.isPendingContainerRebuild ? '(pending rebuild)' : '',
        icon: sidebarTreeView!.fileIcon(this.iconFile, this.iconFileDark)
    })
    setupMenuElement = () => new Dependency({
        id: `Setup||${this.name}`,
        label: 'Setup',
        icon: 'symbol-property'
    })
    deintegrateMenuElement = () => new Dependency({
        id: `Deintegrate||${this.name}`,
        label: this.isDeintegrating ? 'Deintegrating' : 'Deintegrate',
        icon: this.isDeintegrating ? 'sync~spin' : 'trash'
    })
    editConfigMenuItem = () => new Dependency({
        id: `EditConfig||${this.name}`,
        label: 'Configuration',
        icon: 'symbol-property'
    })

    private async menuItems(): Promise<Dependency[]> {
        let items: Dependency[] = []
        if (this.requiresSetup()) {
            items.push(this.setupMenuElement())
        } else {
            items.push(...(await this.featureMenuItems()))
        }
        if (!this.requiresSetup() && this.configurable()) {
            items.push(this.editConfigMenuItem())
        }
        items.push(this.deintegrateMenuElement())
        return items
    }
    async featureMenuItems(): Promise<Dependency[]> { return [] }

    async debugActionItems(): Promise<Dependency[]> { return[] }
    async debugOptionItems(): Promise<Dependency[]> { return [] }
    async releaseItems(): Promise<Dependency[]> { return [] }
    async projectItems(): Promise<Dependency[]> { return [] }
    async maintenanceItems(): Promise<Dependency[]> { return [] }
    async settingsItems(): Promise<Dependency[]> { return [] }
    async recommendationsItems(): Promise<Dependency[]> { return [] }
    async customItems(element: Dependency): Promise<Dependency[]> {
        if (element.id == this.name) {
            return await this.menuItems()
        }
        return []
    }

    async onStartup(): Promise<boolean> {
        if (!this.isInstalled) return false
        if (this.isPendingContainerRebuild) return false
        if (!this.isBinaryPresent()) return false
        return true
    }
    async onDidSaveTextDocument(path: string): Promise<boolean> { return false }

    updateIsInstalled() {
        this.isInstalled = this.isBinaryPresent()
        const devcontainerConfig = this.getDevcontainerConfig()
        var features: any = devcontainerConfig.features ?? {}
        const repo = `${this.repositoryAddress()}:${this.featureVersion}`
        const check = Object.keys(features).find((x) => x.startsWith(repo))
        if (check === undefined) this.isInstalled = false
    }

    requiresSetup(): boolean { return false }

    async setup() {
        throw `Setup is not implemented for ${this.name}`
    }

    getDefaultProjectId() { return this.getConfig()?.defaultProjectId }
    setDefaultProjectId(value: string) { this.changeConfigKey('defaultProjectId', value) }

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

    configurable(): boolean { return this.configFile != undefined }

    async copyOriginalConfig() {
        throw `copyOriginalConfig is not implemented for ${this.name}`
    }

    async openConfigInEditor() {
        if (fs.existsSync(this.configPath())) {
            await openDocumentInEditor(this.configPath())
        } else {
            switch (await window.showInformationMessage(`Would you like to create ${this.name} config file?`, 'Yes, create', 'No')) {
                case 'Yes, create':
                    await this.copyOriginalConfig()
                    await this.openConfigInEditor()
                    break
                default: break
            }
        }
    }

    async integrate(): Promise<boolean> {
        if (this.isPendingContainerRebuild) {
            const rebuildAction = 'Rebuild the Container'
            const revertAction = `Remove ${this.name} from devcontainer.json`
            switch (await window.showQuickPick([ rebuildAction, revertAction ], { placeHolder: `` })) {
            case rebuildAction:
                await commands.executeCommand('remote-containers.rebuildContainer')    
                break
            case revertAction:
                await this.removePending()
                break
            default: break
            }
            return false
        }
        switch (await window.showQuickPick([ 'Yes', 'No' ], { placeHolder: `Would you like to install ${this.name}?` })) {
        case 'Yes': break
        default: return false
        }
        const repo = this.repositoryAddress()
        let config = new DevContainerConfig()
        if (config.hasFeature(repo)) {
            window.showInformationMessage(`${this.name} CLI has already been installed but is not yet available. Please try reloading the window first. If that doesn’t help, please file a bug.`)
            return false
        }
        config.addFeature(repo, this.featureVersion, this.featureParams)
        config.save()
        if (this.isDeintegrated) {
            this.isDeintegrated = false
            this.isPendingContainerRebuild = false
            this.updateIsInstalled()
        } else {
            this.isPendingContainerRebuild = true
            window.showInformationMessage(`${this.name} CLI has been added, please rebuild the container.`, 'Rebuild').then(async (x) => {
                if (x != 'Rebuild') return
                await commands.executeCommand('remote-containers.rebuildContainer')    
            })
        }
        sidebarTreeView?.refresh()
        return true
    }

    async deintegrate(): Promise<boolean> {
        if (this.isDeintegrating) return false
        this.isDeintegrating = true
        sidebarTreeView?.refresh()
        const answer = await window.showWarningMessage(`Are you sure you want to deintegrate ${this.name} from the project? This will completely delete the ${this.name} folder and prompt you to rebuild the container afterward.`, 'Yes, deintegrate')
        if (answer != 'Yes, deintegrate') {
            this.isDeintegrating = false
            sidebarTreeView?.refresh()
            return false
        }
        const removeFiles = () => {
            const pathToRemove = path.join(projectDirectory!, this.name)
            if (fs.existsSync(pathToRemove))
                fs.rmSync(pathToRemove, { recursive: true, force: true })
        }
        await new Promise((resolve) => {
            this.logout(async () => {
                resolve(undefined)
            })
        })
        removeFiles()
        const repo = this.repositoryAddress()
        DevContainerConfig.transaction((c) => {
            if (!c.removeFeature(repo)) return
            window.showInformationMessage(`${this.name} has been deintegrated, please rebuild the container.`, 'Rebuild').then(async (x) => {
                if (x != 'Rebuild') return
                await commands.executeCommand('remote-containers.rebuildContainer')    
            })
        })
        this.updateIsInstalled()
        this.isDeintegrating = false
        this.isDeintegrated = true
        sidebarTreeView?.refresh()
        return true
    }

    async removePending() {
        if (this.isInstalled) return
        const repo = this.repositoryAddress()
        DevContainerConfig.transaction((c) => {
            if (!c.removeFeature(repo)) return
            window.showInformationMessage(`${this.name} has been removed from devcontainer.json`)
        })
        this.isPendingContainerRebuild = false
        sidebarTreeView?.refresh()
    }

    login = async (callback: () => void) => {
        if (!this.loginCommand) return callback()
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
    
    private logout = async (callback: () => void) => {
        if (!this.logoutCommand) return callback()
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

    execute = async (args: string[], cwd: string): Promise<BashResult> => {
        print(`executing ${this.binName} ${args.join(' ')}`, LogLevel.Verbose)
        var env = process.env
        env.VSCODE_CWD = ''
        const result = await this.bash.execute({
            path: this.binPath!,
            description: this.name,
            cwd: cwd,
            env: env
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

    configPath(configFile?: string): string {
        return path.join(this.projectFeatureFolderPath(), configFile ?? this.configFile ?? '')
    }

    getConfig = (configFile?: string): any | undefined => {
        const configPath = this.configPath(configFile)
        if (!fs.existsSync(configPath)) return undefined
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return undefined
        if (configPath.endsWith('nginx.conf')) return fs.readFileSync(configPath, 'utf8')
        if (path.extname(configPath) == '.toml') return toml.parse(configString)
        else return JSON.parse(configString)
    }

    changeConfig = (processor: (config: any) => any, configFile?: string) => {
        const configFileName = configFile ?? this.configFile
        if (!configFileName) return
        const configPath = path.join(this.projectFeatureFolderPath(), configFileName)
        if (!fs.existsSync(configPath)) {
            if (configPath.endsWith('nginx.conf')) fs.writeFileSync(configPath, '')
            else if (path.extname(configPath) == '.toml') fs.writeFileSync(configPath, toml.stringify({}))
            else fs.writeFileSync(configPath, JSON.stringify({}, null, '\t'))
        }
        const configString = fs.readFileSync(configPath, 'utf8')
        if (!configString) return
        let config: any | undefined = undefined
        if (configPath.endsWith('nginx.conf')) config = configString
        else if (path.extname(configPath) == '.toml') config = toml.parse(configString)
        else config = JSON.parse(configString)
        if (!config) return
        const processorResult = processor(config)
        if (!processorResult) return
        if (configPath.endsWith('nginx.conf')) return fs.writeFileSync(configPath, processorResult)
        else if (path.extname(configPath) == '.toml') return fs.writeFileSync(configPath, toml.stringify(processorResult))
        else fs.writeFileSync(configPath, JSON.stringify(processorResult, null, '\t'))
    }

    removeConfig(configFile?: string) {
        const path = this.configPath(configFile)
        if (!fs.existsSync(path)) return
        fs.rmSync(path, { force: true })
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