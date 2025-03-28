import { WebStream } from '../webStream'
import { CloudFeature } from './cloudFeature'

export class Heroku extends CloudFeature {
    constructor(stream: WebStream) {
        super(
            stream,
            {
                name: 'Heroku',
                iconFile: 'heroku3',
                featureRepository: 'swiftstream/vsce',
                featureName: 'heroku-cli', featureVersion: 'latest', featureParams: {},
                configFile: 'heroku.conf',
                binFolder: '/usr/local/bin', // TODO
                binName: 'heroku'
            }
        )
    }
}