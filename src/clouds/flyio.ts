import { projectDirectory, sidebarTreeView } from '../extension'
import { env, ProgressLocation, Uri, window } from 'vscode'
import { CloudFeature } from './cloudFeature'
import { WebStream } from '../streams/web/webStream'

export class FlyIO extends CloudFeature {
    constructor(webStream: WebStream) {
        super(
            webStream,
            'Fly.io',
            'swiftstream/vsce',
            'flyio-cli', 'latest', {},
            'fly.toml',
            'flyctl',
            'auth login',
            'auth logout'
        )
    }

    setup = async () => {
        this.copyFiles(this.extensionFeatureSourcesPath(), this.projectFeatureFolderPath(), ['Dockerfile', 'fly.toml', 'nginx.conf'])
        window.showInformationMessage(`${this.name} files has been added`)
        sidebarTreeView?.refresh()
    }

    createProject = async (id: string): Promise<string | undefined> => {
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

    getListOfProjects = async (): Promise<any[] | undefined> => {
        const listResponse = await this.execute(['apps', 'list', '--json'], this.projectFeatureFolderPath())
        if (!listResponse.stdout) throw 'Unable to get list of projects'
        return JSON.parse(listResponse.stdout)
    }

    deploy = async (selectedProjectId?: string): Promise<boolean | undefined> => {
        if (this.isDeploying) return false
        if (!this.isReleaseBuilt()) return false
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