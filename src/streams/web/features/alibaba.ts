import { WebStream } from '../webStream'
import { CloudFeature } from './cloudFeature'

export class Alibaba extends CloudFeature {
    constructor(stream: WebStream) {
        super(
            stream,
            {
                name: 'Alibaba Cloud',
                iconFile: 'alibabacloud3',
                featureRepository: 'swiftstream/vsce',
                featureName: 'alibaba-cli', featureVersion: 'latest', featureParams: {},
                configFile: 'alibaba.conf',
                binName: 'alibaba'
            }
        )
    }
}