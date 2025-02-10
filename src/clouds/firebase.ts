import * as fs from 'fs'
import * as path from 'path'
import { buildProdFolder, indexFile, Webber } from '../webber'
import { projectDirectory, sidebarTreeView } from '../extension'
import { ProgressLocation, window } from 'vscode'

import { CloudFeature } from './cloudFeature'

export class Firebase extends CloudFeature {
    constructor(webber: Webber) {
        super(
            webber,
            'Firebase',
            'devcontainers-contrib/features',
            'firebase-cli', '2', { version: 'latest', install: '${FIREBASE_CLI:-false}' },
            'firebase.json',
            'firebase',
            'login',
            'logout'
        )
    }

    setup = async () => {
        this.copyFiles(this.extensionFeatureSourcesPath(), this.projectFeatureFolderPath(), ['firebase.json', '.gitignore'])
        this.copyFiles(path.join(this.extensionFeatureSourcesPath(), 'functions'), path.join(this.projectFeatureFolderPath(), 'functions'), ['package.json', 'index.js', 'predeploy.sh', '.gitignore'])
        this.makeExecutable(path.join(this.projectFeatureFolderPath(), 'functions', 'predeploy.sh'))
        if (!fs.existsSync(path.join(projectDirectory!, buildProdFolder))) {
            fs.mkdirSync(path.join(projectDirectory!, buildProdFolder))
        }
        fs.symlinkSync(path.join(projectDirectory!, buildProdFolder), path.join(this.projectFeatureFolderPath(), 'public'))
        window.showInformationMessage(`${this.name} files has been added`)
        sidebarTreeView?.refresh()
    }

    private setHostingRewrites = (full: boolean) => {
        this.changeConfig((config) => {
            var rewrites: any[] = config.hosting.rewrites
            const indexToDelete = rewrites.findIndex((x) => x.source == '/**')
            if (indexToDelete >= 0) rewrites.splice(indexToDelete, 1)
            if (full) {
                rewrites.push({
                    'source': '/**',
                    'function': 'renderHtml'
                })
            } else {
                rewrites.push({
                    'source': '/**',
                    'destination': `/${indexFile}`
                })
            }
            config.hosting.rewrites = rewrites
            return config
        })
    }

    getFullDeployMode = () => this.getConfig()?.fullDeployMode
    setFullDeployMode = (value: boolean) => this.changeConfigKey('fullDeployMode', value)

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
    
    createProject = async (id: string): Promise<string | undefined> => {
        const createResponse = await this.execute(['projects:create', id, '--display-name', `"${id}"`, '--json'], this.projectFeatureFolderPath())
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

    getListOfProjects = async (): Promise<any[] | undefined> => {
        const listResponse = await this.execute(['projects:list', '--json'], this.projectFeatureFolderPath())
        if (!listResponse.stdout) throw 'Unable to get list of projects'
        const response = JSON.parse(listResponse.stdout)
        if (response.status != 'success') throw 'Unable to get list of projects'
        return response.result
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
                    await this.showListOfProjects(list.map((p) => p.projectId))
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
                    const commands = [
                        `cd ${path.join(this.projectFeatureFolderPath(), 'functions')}`,
                        'npm install',
                        `cd ${this.projectFeatureFolderPath()}`,
                        `${this.binName} deploy --only ${what} --project ${selectedProjectId}`
                    ]
                    await this.runDeployTask(commands.join(' && '))
                }
            } catch (error) {
                const result = this.processDeployError(error)
                if (result.bashError && result.bashError.code == 1 && result.bashError.stdout?.includes('authenticate') == true) {
                    this.askForAuthentication()
                } else {
                    result.fallback()
                }
            }
        })
    }
}