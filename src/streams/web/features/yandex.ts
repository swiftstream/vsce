import { WebStream } from '../webStream'
import { CloudFeature } from './cloudFeature'

export class Yandex extends CloudFeature {
    constructor(stream: WebStream) {
        super(
            stream,
            {
                name: 'Yandex Cloud',
                iconFile: 'yandexcloud3',
                featureRepository: 'swiftstream/vsce',
                featureName: 'yandex-cli', featureVersion: 'latest', featureParams: {},
                configFile: 'yandex.conf',
                binFolder: '/usr/local/bin', // TODO
                binName: 'yandex'
            }
        )
    }
}