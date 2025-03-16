import { WebStream } from '../webStream'
import { CloudFeature } from './cloudFeature'

export class Cloudflare extends CloudFeature {
    constructor(stream: WebStream) {
        super(
            stream,
            {
                name: 'Cloudflare',
                iconFile: 'cloudflare3',
                featureRepository: 'swiftstream/vsce',
                featureName: 'cloudflare-cli', featureVersion: 'latest', featureParams: {},
                configFile: 'cloudflare.conf',
                binName: 'cloudflare'
            }
        )
    }
}