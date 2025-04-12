import { commands, env, ProgressLocation, ShellExecution, Task, TaskDefinition, tasks, TaskScope, Uri, window } from 'vscode'
import { ServerStream } from '../serverStream'
import { CloudFeature } from './cloudFeature'
import { extensionContext, isArm64, projectDirectory, sidebarTreeView } from '../../../extension'
import { Dependency } from '../../../sidebarTreeView'
import { PureBuildMode, pureBuildModeToSwiftBuildMode, releaseBuildMode } from '../../pure/pureStream'
import { buildRelease } from '../../pure/commands/buildRelease'

export class FlyIO extends CloudFeature {
    streamingLogs: boolean = false

    constructor(stream: ServerStream) {
        super(
            stream,
            {
                name: 'Fly.io',
                iconFile: 'flyio3',
                featureRepository: 'swiftstream/vsce',
                featureName: 'flyio-cli', featureVersion: 'latest', featureParams: {},
                configFile: 'fly.toml',
                binFolder: '/root/.fly/bin',
                binName: 'flyctl',
                loginCommand: 'auth login',
                logoutCommand: 'auth logout'
            }
        )
    }

    registerCommands() {
        super.registerCommands()
        extensionContext.subscriptions.push(commands.registerCommand(this.liveLogsMenuElement().id, async () => await this.streamLiveLogsTask()))
        return
    }

    liveLogsMenuElement = () => new Dependency({
        id: `LiveLogs||${this.name}`,
        label: this.streamingLogs ? 'Streaming Logs' : 'Live Logs',
        icon: this.streamingLogs ? 'sync~spin' : 'debug-line-by-line'
    })

    async featureMenuItems(): Promise<Dependency[]> {
        return [
            ...(await super.featureMenuItems()),
            this.liveLogsMenuElement()
        ]
    }
    
    async setup() {
        this.copyFiles(this.extensionFeatureSourcesPath(), this.projectFeatureFolderPath(), ['Dockerfile', 'fly.toml', 'nginx.conf'])
        window.showInformationMessage(`${this.name} files has been added`)
        sidebarTreeView?.refresh()
    }

    async createProject(id: string): Promise<string | undefined> {
        const createResponse = await this.execute(['apps', 'create', id, '--name', id, '--json'], this.projectFeatureFolderPath())
        if (!createResponse.stdout) {
            window.showErrorMessage('Unable to create project')
            return undefined
        }
        const response = JSON.parse(createResponse.stdout)
        if (response.Name != id) {
            window.showErrorMessage('Unable to create project')
            return undefined
        }
        return response.Name
    }

    async getListOfProjects(): Promise<any[] | undefined> {
        const listResponse = await this.execute(['apps', 'list', '--json'], this.projectFeatureFolderPath())
        if (!listResponse.stdout) throw 'Unable to get list of projects'
        return JSON.parse(listResponse.stdout)
    }

    async getListOfRegions(): Promise<any[] | undefined> {
        const listResponse = await this.execute(['platform', 'regions', '--json'], this.projectFeatureFolderPath())
        if (!listResponse.stdout) throw 'Unable to get list of regions'
        return JSON.parse(listResponse.stdout)
    }

    getDefaultProjectId() { return this.getConfig()?.default_project_id }
    setDefaultProjectId(value: string) { this.changeConfigKey('default_project_id', value) }

    getPrimaryRegion() { return this.getConfig()?.primary_region }
    setPrimaryRegion(value: string) { this.changeConfigKey('primary_region', value) }

    getAgreedToBuildForX86(): boolean { return this.getConfig()?.agreed_to_build_for_x86 }
    setAgreedToBuildForX86() { this.changeConfigKey('agreed_to_build_for_x86', true) }

    getAgreedToUseStaticLinux(): boolean { return this.getConfig()?.agreed_to_use_static_linux }
    setAgreedToUseStaticLinux() { this.changeConfigKey('agreed_to_use_static_linux', true) }

    isHighAvailabilityEnabled(): boolean { return !(this.getConfig()?.deploy?.count === 1) }
    
    async deploy(selectedProjectId?: string): Promise<boolean | undefined> {
        if (isArm64 && [PureBuildMode.Standard, PureBuildMode.StaticLinuxArm].includes(releaseBuildMode)) {
            if (this.getAgreedToBuildForX86()) {
                if (await this.stream.isMuslSDKInstalled() === false) return false
                this.stream.setReleaseBuildMode(PureBuildMode.StaticLinuxX86)
                sidebarTreeView?.refresh()
            } else {
                switch (await window.showQuickPick(['Deploy x86', 'Cancel'], {
                    title: 'Fly.io can run only x86 binaries',
                    placeHolder: 'Would you like to deploy x86 binary?'
                })) {
                    case 'Deploy x86':
                        if (await this.stream.isMuslSDKInstalled() === false) return false
                        this.stream.setReleaseBuildMode(PureBuildMode.StaticLinuxX86)
                        sidebarTreeView?.refresh()
                        this.setAgreedToBuildForX86()
                        break
                    default: return false
                }
            }
        } else if (!isArm64 && releaseBuildMode === PureBuildMode.Standard) {
            if (this.getAgreedToUseStaticLinux()) {
                if (await this.stream.isMuslSDKInstalled() === false) return false
                this.stream.setReleaseBuildMode(PureBuildMode.StaticLinuxX86)
                sidebarTreeView?.refresh()
            } else {
                switch (await window.showQuickPick([
                    'Static Linux (musl)',
                    'Standard (glibc)',
                    'Cancel'
                ], {
                    placeHolder: 'Which build mode you would like to use?'
                })) {
                    case 'Static Linux (musl)':
                        if (await this.stream.isMuslSDKInstalled() === false) return false
                        this.stream.setReleaseBuildMode(PureBuildMode.StaticLinuxX86)
                        sidebarTreeView?.refresh()
                        this.setAgreedToUseStaticLinux()
                        break
                    case 'Standard (glibc)':
                        break
                    default: return false
                }
            }
        }
        if (this.isDeploying) return false
        await this.stream.swift.askToChooseTargetIfNeeded({ release: true })
        const selectedTarget = this.stream.swift.selectedTarget({ release: true })
        if (!selectedTarget)
            throw `Please select Swift target to deploy`
        let isJustRebuilt = false
        if (!this.stream.isReleaseBuilt(selectedTarget, releaseBuildMode)) {
            isJustRebuilt = true
            if (await this.stream.askToBuildRelease({
                beforeWhat: 'deploy',
                askToContinueTo: {
                    toText: 'Fly.io Deploy',
			        continueTitle: 'Deploy'
                }
            }) === false) return false
        }
        if (!isJustRebuilt) {
            switch (await window.showQuickPick([
                'Yes, rebuild',
                'No, deploy as-is',
                'Cancel'
            ], {
                placeHolder: 'Would you like to rebuild before deploy?'
            })) {
                case 'Yes, rebuild':
                    await buildRelease(this.stream, releaseBuildMode)
                    break
                case 'No, deploy as-is': break
                default: return false
            }
        }
        if (!this.stream.swift.makeTmpCopyOfTargetBinary({
            release: true,
            buildMode: pureBuildModeToSwiftBuildMode(releaseBuildMode)
        })) throw `Unable to copy release binary`
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
                    const list = await this.getListOfProjects()
                    if (!list) throw 'Unable to get list of projects'
                    selectedProjectId = await this.showListOfProjects(list.map((p) => p.Name), 'to deploy to', true)
                    if (!selectedProjectId) {
                        this.isDeploying = false
                        sidebarTreeView?.refresh()
                        return
                    }
                }
                if (!this.getPrimaryRegion()) {
                    const list = await this.getListOfRegions()
                    if (!list) throw 'Unable to get list of regions'
                    const primaryRegionName = await window.showQuickPick([
                        ...list.map((p) => p.Name)
                    ], {
                        placeHolder: `Select primary region`
                    })
                    if (!primaryRegionName) {
                        this.isDeploying = false
                        sidebarTreeView?.refresh()
                        return
                    }
                    this.setPrimaryRegion(list.find((x) => x.Name === primaryRegionName)!.Code)
                }
                const highAvailability = this.isHighAvailabilityEnabled()
                const commands = [
                    `cd ${projectDirectory}`,
                    `${this.binName} deploy --app ${selectedProjectId} --config ./Fly.io/fly.toml --dockerfile ./Fly.io/Dockerfile --dns-checks=false ${!highAvailability ? '--ha=false' : ''}`
                ]
                await this.runDeployTask(commands.join(' && '))
            } catch (error) {
                const result = this.processDeployError(error)
                if (result.bashError?.code == 1 && result.bashError?.stderr?.includes('auth login') == true) {
                    this.askForAuthentication()
                } else if (result.bashError?.code == 1 && result.bashError?.stderr?.includes('credit card') == true) {
                    const answer = await window.showErrorMessage(`Seems you have to add your credit card to Fly.io first.`, 'Go to Fly Dashboard')
                    if (answer == 'Go to Fly Dashboard') {
                        env.openExternal(Uri.parse('https://fly.io/dashboard'))
                    }
                } else if (result.bashError?.code == 1 && result.bashError?.stderr?.includes('high risk') == true) {
                    const answer = await window.showErrorMessage(`Your account has been marked as high risk.`, 'Verify your account')
                    if (answer == 'Verify your account') {
                        env.openExternal(Uri.parse('https://fly.io/high-risk-unlock'))
                    }
                } else {
                    result.fallback()
                }
            }
        })
    }

    streamLiveLogsTask = async (selectedProjectId?: string) => {
        const taskName = `${this.name} Logs`
        if (this.streamingLogs) {
            const terminal = window.terminals.find((x) => x.name.includes(taskName))
            const task = tasks.taskExecutions.find((x) => x.task.name === taskName)
            if (!terminal || !task) {
                this.streamingLogs = false
                sidebarTreeView?.refresh()
                return
            }
            const showAction = `Show terminal with logs`
            const stopAction = `Disconnect from logs`
            switch (await window.showQuickPick([ showAction, stopAction ], { placeHolder: `Choose ${this.name} action` })) {
            case showAction:
                terminal.show(true)
                return
            case stopAction:
                task.terminate()
                return
            default: return
            }
        }
        if (!selectedProjectId) selectedProjectId = this.getDefaultProjectId()
        if (!selectedProjectId) {
            const list = await this.getListOfProjects()
            if (!list) throw 'Unable to get list of projects'
            selectedProjectId = await this.showListOfProjects(list.map((p) => p.Name), 'for logs')
            if (!selectedProjectId) {
                this.streamingLogs = false
                sidebarTreeView?.refresh()
                return
            }
        }
        const startListener = tasks.onDidStartTask((event) => {
            if (event.execution.task.name === taskName) {
                this.streamingLogs = true
                sidebarTreeView?.refresh()
            }
        })
        const endListener = tasks.onDidEndTask((event) => {
            if (event.execution.task.name === taskName) {
                this.streamingLogs = false
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
            command: `${this.binName} logs -a ${selectedProjectId}`,
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
}