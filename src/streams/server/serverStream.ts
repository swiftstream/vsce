import { commands, ConfigurationChangeEvent, FileDeleteEvent, FileRenameEvent } from 'vscode'
import { Stream } from '../stream'
import { SideTreeItem } from '../../sidebarTreeView'
import { extensionContext } from '../../extension'

export class ServerStream extends Stream {
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