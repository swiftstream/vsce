import { WebStream } from '../webStream'
import { CloudFeature } from './cloudFeature'

export class Vercel extends CloudFeature {
    constructor(stream: WebStream) {
        super(
            stream,
            {
                name: 'Vercel',
                iconFile: 'vercel-dark3',
                iconFileDark: 'vercel-light3',
                featureRepository: 'swiftstream/vsce',
                featureName: 'vercel-cli', featureVersion: 'latest', featureParams: {},
                configFile: 'vercel.conf',
                binName: 'vercel'
            }
        )
    }
}