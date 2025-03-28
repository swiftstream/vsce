import * as path from 'path'
import { extensionContext } from '../../../extension'
import { WebStream } from '../webStream'
import { AnyFeature } from '../../anyFeature'

export class WebFeature extends AnyFeature {
    constructor (
        public stream: WebStream,
        params: {
            name: string,
            iconFile: string,
            iconFileDark?: string,
            featureRepository: string,
            featureName: string,
            featureVersion: string,
            featureParams: any,
            configFile: string,
            binFolder: string,
            binName: string,
            loginCommand?: string,
            logoutCommand?: string
        }
    ) {
        super(
            stream.bash,
            params.name,
            params.iconFile,
            params.iconFileDark,
            params.featureRepository,
            params.featureName,
            params.featureVersion,
            params.featureParams,
            params.configFile,
            params.binFolder,
            params.binName,
            params.loginCommand,
            params.logoutCommand
        )
    }
    
    extensionFeatureSourcesPath(): string {
        return path.join(extensionContext.extensionPath, 'assets', 'Devcontainer', 'web', 'Features', this.name)
    }

    async createProject(id: string): Promise<string | undefined> {
        throw `createProject is not implemented for ${this.name}`
    }

    async getListOfProjects(): Promise<any[] | undefined> {
        throw `getListOfProjects is not implemented for ${this.name}`
    }
}