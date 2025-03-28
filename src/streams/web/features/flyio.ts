import { projectDirectory, sidebarTreeView } from '../../../extension'
import { env, ProgressLocation, Uri, window } from 'vscode'
import { CloudFeature } from './cloudFeature'
import { WebStream } from '../webStream'

export class FlyIO extends CloudFeature {
    constructor(stream: WebStream) {
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

    async deploy(selectedProjectId?: string): Promise<boolean | undefined> {
        if (this.isDeploying) return false
        if (!this.stream.isReleaseBuilt()) return false
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
                    await this.showListOfProjects(list.map((p) => p.Name))
                } else {
                    const commands = [
                        `cd ${projectDirectory}`,
                        `${this.binName} deploy --app ${selectedProjectId} --config ./Fly.io/fly.toml --dockerfile ./Fly.io/Dockerfile --dns-checks=false`
                    ]
                    await this.runDeployTask(commands.join(' && '))
                }
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
}