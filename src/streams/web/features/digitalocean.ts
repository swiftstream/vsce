import { WebStream } from '../webStream'
import { CloudFeature } from './cloudFeature'

export class DigitalOcean extends CloudFeature {
    constructor(stream: WebStream) {
        super(
            stream,
            {
                name: 'DigitalOcean',
                iconFile: 'digitalocean3',
                featureRepository: 'swiftstream/vsce',
                featureName: 'digitalocean-cli', featureVersion: 'latest', featureParams: {},
                configFile: 'digitalocean.conf',
                binFolder: '/usr/local/bin', // TODO
                binName: 'digitalocean'
            }
        )
    }
}