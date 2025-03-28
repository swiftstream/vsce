import { WebStream } from '../webStream'
import { CloudFeature } from './cloudFeature'

export class Azure extends CloudFeature {
    constructor(stream: WebStream) {
        super(
            stream,
            {
                name: 'Azure',
                iconFile: 'azure3',
                featureRepository: 'swiftstream/vsce',
                featureName: 'azure-cli', featureVersion: 'latest', featureParams: {},
                configFile: 'azure.conf',
                binFolder: '/usr/local/bin', // TODO
                binName: 'azure'
            }
        )
    }
}