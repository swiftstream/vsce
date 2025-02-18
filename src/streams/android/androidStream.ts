import { ConfigurationChangeEvent, FileDeleteEvent, FileRenameEvent } from 'vscode'
import { Stream } from '../stream'

export class AndroidStream extends Stream {
    constructor() {
        super()

        this._configureServer()
    }

    private _configureServer = async () => {

    }

    async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        super.onDidChangeConfiguration(event)

    }

    registerCommands() {
        super.registerCommands()

    }

    onDidRenameFiles(event: FileRenameEvent) {
        super.onDidRenameFiles(event)

    }

    onDidDeleteFiles(event: FileDeleteEvent) {
        super.onDidDeleteFiles(event)

    }
}