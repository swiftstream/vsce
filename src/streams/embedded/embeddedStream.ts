import { ConfigurationChangeEvent, FileDeleteEvent, FileRenameEvent, TextDocument, window } from 'vscode'
import { LogLevel, print, Stream } from '../stream'
import { Dependency } from '../../sidebarTreeView'
import { isInContainer } from '../../extension'

export enum EmbeddedBuildSystem {
    SwiftPM = 'SwiftPM',
    Makefile = 'Makefile',
    CMake = 'CMake',
    ShellScript = 'ShellScript',
    Unknown = 'Unknown'
}
export function stringToBuildSystem(v: string): EmbeddedBuildSystem {
    return Object.values(EmbeddedBuildSystem).includes(v.toUpperCase() as EmbeddedBuildSystem)
        ? v.toUpperCase() as EmbeddedBuildSystem
        : EmbeddedBuildSystem.Unknown
}

export class EmbeddedStream extends Stream {
    branch: EmbeddedBranch = EmbeddedBranch.Unknown
    detectedBuildSystem: EmbeddedBuildSystem = EmbeddedBuildSystem.Unknown
    buildTaskRunner!: EmbeddedBuildTaskRunner

    constructor(overrideConfigure: boolean = false) {
        super(true)

        if (!overrideConfigure) this.configure()
    }

    configure() {
        super.configure()
        this.branch = DevContainerConfig.getEmbeddedBranch()
        this._detectBuildSystem()
        this.setContext(ContextKey.isEmbeddedStream, true)
        const isBuildButtonEnabled = workspace.getConfiguration().get('swift.showTopBuildButton') as boolean
        this.setContext(ContextKey.isNavigationBuildButtonEnabled, isBuildButtonEnabled ?? true)
        if (this.branch !== EmbeddedBranch.RASPBERRY) {
            const isFlashButtonEnabled = workspace.getConfiguration().get('swift.showTopFlashButton') as boolean
            this.setContext(ContextKey.isNavigationFlashButtonEnabled, isFlashButtonEnabled ?? true)
        }
        this.buildTaskRunner = new EmbeddedBuildTaskRunner()
    }

    buildSystemHasCMake = false

    hasSwiftPackage(): boolean {
        return fs.existsSync(path.join(projectDirectory!, 'Package.swift'))
    }

    private _detectBuildSystem() {
        if (this.hasSwiftPackage()) {
            this.detectedBuildSystem = EmbeddedBuildSystem.SwiftPM
        }
        if (fs.existsSync(path.join(projectDirectory!, 'CMakeLists.txt'))) {
            this.detectedBuildSystem = EmbeddedBuildSystem.CMake
            this.buildSystemHasCMake = true
        }
        if (fs.existsSync(path.join(projectDirectory!, 'Makefile'))) {
            this.detectedBuildSystem = EmbeddedBuildSystem.Makefile
        }
        if (fs.readdirSync(projectDirectory!).some(x => x.endsWith('.sh'))) {
            this.detectedBuildSystem = EmbeddedBuildSystem.ShellScript
        }
    }

    async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        super.onDidChangeConfiguration(event)

    }

    defaultFirmwareFile(scheme: Scheme): string | undefined {
        switch (this.branch) {
        case EmbeddedBranch.ESP32:
            return path.join(
                scheme.buildFolder ?? buildFolderBySystem(scheme.build.system),
                `${scheme.binaryName}.bin`
            )
        case EmbeddedBranch.NRF:
            return path.join(
                scheme.buildFolder ?? buildFolderBySystem(scheme.build.system),
                'zephyr',
                `${scheme.binaryName}.hex`
            )
        case EmbeddedBranch.RASPBERRY:
            return path.join(
                scheme.buildFolder ?? buildFolderBySystem(scheme.build.system),
                `${scheme.binaryName}.uf2`
            )
        case EmbeddedBranch.STM32:
            return path.join(
                scheme.buildFolder ?? buildFolderBySystem(scheme.build.system),
                `${scheme.binaryName}.hex`
            )
        }
        return undefined
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
        
    // MARK: Global Keybinding

    async globalKeyRun() {
        window.showErrorMessage(`Run key binding not assigned`)
    }

    // MARK: Building

    async buildDebug() {
		await super.buildDebug()
        print('stream.build not implemented', LogLevel.Detailed)
    }

    async buildRelease(successCallback?: any) {
        await super.buildRelease()
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
    async customItems(element: Dependency): Promise<Dependency[]> { return await super.customItems(element) }
}