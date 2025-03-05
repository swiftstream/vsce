import { ConfigurationChangeEvent, FileDeleteEvent, FileRenameEvent, TextDocument } from 'vscode'
import { LogLevel, print, Stream } from '../stream'
import { Dependency } from '../../sidebarTreeView'
import { isInContainer } from '../../extension'

export class PureStream extends Stream {
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
        
    async onDidSaveTextDocument(document: TextDocument): Promise<boolean> {
		if (await super.onDidSaveTextDocument(document)) return true
		if (!isInContainer) return false

        return false
    }

    // MARK: Building

    async buildDebug() {
        print('stream.build not implemented', LogLevel.Detailed)
    }

    async buildRelease(successCallback?: any) {
        print('stream.buildRelease not implemented', LogLevel.Detailed)
    }

    // MARK: Side Bar Tree View Items

    async debugActionItems(): Promise<Dependency[]> { return [] }
    async debugOptionItems(): Promise<Dependency[]> { return [] }
    async releaseItems(): Promise<Dependency[]> { return [] }
    async projectItems(): Promise<Dependency[]> { return [] }
    async maintenanceItems(): Promise<Dependency[]> { return [] }
    async settingsItems(): Promise<Dependency[]> { return [] }
    async isThereAnyRecommendation(): Promise<boolean> { return false }
    async recommendationsItems(): Promise<Dependency[]> { return [] }
    async customItems(element: Dependency): Promise<Dependency[]> { return [] }
}