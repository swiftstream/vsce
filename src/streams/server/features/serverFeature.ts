import * as path from 'path'
import { extensionContext } from '../../../extension'
import { ServerStream } from '../serverStream'
import { AnyFeature } from '../../anyFeature'

export class ServerFeature extends AnyFeature {
    constructor (
        public stream: ServerStream,
        private params: {
            name: string,
            iconFile: string,
            iconFileDark?: string,
            featureRepository: string,
            featureName: string,
            featureVersion: string,
            featureParams: any,
            configFile: string,
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
            params.binName,
            params.loginCommand,
            params.logoutCommand
        )
    }
    
    extensionFeatureSourcesPath(): string {
        return path.join(extensionContext.extensionPath, 'assets', 'Devcontainer', 'server', 'Features', this.name)
    }  
}