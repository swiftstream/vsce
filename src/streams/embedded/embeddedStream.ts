import * as fs from 'fs'
import * as path from 'path'
import { commands, ConfigurationChangeEvent, FileDeleteEvent, FileRenameEvent, TextDocument, window, workspace } from 'vscode'
import { isBuildingDebug, isFlashing, isHotRebuildEnabled, isResolvingPackages, LogLevel, print, Stream } from '../stream'
import { Dependency, SideTreeItem } from '../../sidebarTreeView'
import { ContextKey, extensionContext, isInContainer, projectDirectory, sidebarTreeView } from '../../extension'
import { DevContainerConfig, EmbeddedBranch } from '../../devContainerConfig'
import { AbortHandler } from '../../bash'
import { buildFolderBySystem, chooseScheme, EmbeddedStreamConfig, Scheme, SchemeBuildConfiguration } from '../../embeddedStreamConfig'
import { EmbeddedBuildTaskRunner } from '../../embeddedBuildTaskRunner'
import { buildCommand } from './commands/build'
import { pathToCompiledBinary, SwiftBuildMode } from '../../swift'

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
        let autoselected = false
        EmbeddedStreamConfig.transaction(x => {
            autoselected = x.autoselectScheme()
            const s = x.autoselectScheme()
            if (!autoselected) autoselected = s
        })
        if (autoselected) sidebarTreeView?.refresh()
    }

    buildSystemHasCMake = false

    hasSwiftPackage(): boolean {
        return fs.existsSync(path.join(projectDirectory!, 'Package.swift'))
    }
    hasWokwiFile(): boolean {
        return fs.existsSync(path.join(projectDirectory!, 'diagram.json'))
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

    isDebugBuilt(scheme: Scheme): boolean {
        if (scheme.build.system === EmbeddedBuildSystem.SwiftPM) {
            return fs.existsSync(pathToCompiledBinary({
                target: scheme.binaryName,
                mode: SwiftBuildMode.Standard,
                release: scheme.buildConfiguration == SchemeBuildConfiguration.Release
            }))
        } else if (scheme.flash) {
            for (let i = 0; i < scheme.flash.filesToCopy.length; i++) {
                const file = scheme.flash.filesToCopy[i]
                if (fs.existsSync(path.join(projectDirectory!, file)) === false)
                    return false
            }
            return true
        } else {
            const defaultFirmwareFile = this.defaultFirmwareFile(scheme)
            if (defaultFirmwareFile) {
                const fullPath = path.join(
                    projectDirectory!,
                    defaultFirmwareFile
                )
                return fs.existsSync(fullPath)
            }
        }
        return false
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
        extensionContext.subscriptions.push(commands.registerCommand('BuildFirmware', async () => { await this.buildDebug() }))
        extensionContext.subscriptions.push(commands.registerCommand(this.debugSchemeElement().id, async () => await this.chooseScheme({ release: false }) ))
        extensionContext.subscriptions.push(commands.registerCommand('FlashFirmware', async () => { await this.flash() }))
        extensionContext.subscriptions.push(commands.registerCommand(this.flashElement().id, async () => await this.flash() ))
        extensionContext.subscriptions.push(commands.registerCommand(this.simulatorElement().id, async () => this.openSimulator() ))
    }

    debugSchemeElement() {
        const scheme = EmbeddedStreamConfig.selectedScheme()
        let details = ''
        if (scheme) {
            details = `${scheme.chip}`
        }
        return new Dependency({
            id: SideTreeItem.DebugTarget,
            label: scheme?.title ?? 'Scheme',
            version: details,
            tooltip: `${scheme ? scheme.buildConfiguration == SchemeBuildConfiguration.Debug ? 'Debug ' : 'Release ' : ''}Scheme for Build and Flash actions`,
            icon: scheme ? scheme.buildConfiguration == SchemeBuildConfiguration.Debug ? 'target::charts.orange' : 'target::charts.green' : 'target'
        })
    }
    flashElement = () => new Dependency({
        id: SideTreeItem.DeviceFlash,
        label: 'Flash',
        version: ``,
        tooltip: 'Flash the firmware',
        icon: isFlashing ? 'sync~spin::charts.yellow' : 'symbol-event'
    })
    simulatorElement = () => new Dependency({
        id: SideTreeItem.DeviceSimulator,
        label: 'Simulator',
        version: ``,
        tooltip: 'Open simulator',
        icon: 'device-mobile'
    })

    async flash() {
        const scheme = await this.getSelectedSchemeOrChoose({ release: false })
        if (!scheme) return
        if (!this.isDebugBuilt(scheme)) {
            switch (await window.showInformationMessage(
                `Please build the firmware first, and then hit "Flash" again.`,
                'Build'
            )) {
                case 'Build':
                    await buildCommand(this, scheme)
                    break
                default: break
            }
        } else {
        }
    }
    selectedScheme(): Scheme | undefined {
        return EmbeddedStreamConfig.selectedScheme()
    }
    openSimulator() {
        commands.executeCommand(`wokwi-vscode.start`)
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
    // MARK: Scheme

    async chooseScheme(options: {
        release: boolean,
        abortHandler?: AbortHandler
    }): Promise<Scheme | undefined> {
        const scheme = await chooseScheme(this, {
            release: options.release,
            abortHandler: options.abortHandler
        })
        if (!scheme) return undefined
        EmbeddedStreamConfig.transaction(x => {
            x.setSelectedScheme(scheme)
        })
        sidebarTreeView?.refresh()
    }
    
    async getSelectedSchemeOrChoose(options: {
        release: boolean,
        abortHandler?: AbortHandler
    }): Promise<Scheme | undefined> {
        const selectedScheme = EmbeddedStreamConfig.selectedScheme()
        if (selectedScheme) return selectedScheme
        return await chooseScheme(this, {
            release: options.release,
            abortHandler: options.abortHandler
        })
    }

    // MARK: Building

    private isAwaitingBuild: boolean = false

    async buildDebug() {
		await super.buildDebug()
        const scheme = await this.getSelectedSchemeOrChoose({ release: false })
        if (!scheme) return
        await buildCommand(this, scheme)
    }

    async buildRelease(successCallback?: any) {
        await super.buildRelease()
        print('stream.buildRelease not implemented', LogLevel.Detailed)
    }

    // MARK: Side Bar Tree View Items
    
    async defaultDebugActionItems(): Promise<Dependency[]> {
        let items: Dependency[] = []
        items.push(this.debugSchemeElement())
        return [
            ...items,
            new Dependency({
                id: SideTreeItem.BuildDebug,
                tooltip: 'Cmd+B or Ctrl+B',
                label: isBuildingDebug || this.isAnyHotBuilding() ? this.isAnyHotBuilding() ? 'Hot Rebuilding' : 'Building' : 'Build',
                icon: isBuildingDebug || this.isAnyHotBuilding() ? this.isAnyHotBuilding() ? 'sync~spin::charts.orange' : 'sync~spin::charts.green' : sidebarTreeView!.fileIcon('hammer')
            })
        ]
    }

    async debugActionItems(): Promise<Dependency[]> { return [] }
    async debugOptionItems(): Promise<Dependency[]> { return [] }
    async deviceItems(): Promise<Dependency[]> {
        let items: Dependency[] = []
        items.push(this.flashElement())
        if (this.hasWokwiFile()) {
            items.push(this.simulatorElement())
        }
        return items
    }
    async releaseItems(): Promise<Dependency[]> { return [] }
    async projectItems(): Promise<Dependency[]> { return [] }
    async maintenanceItems(): Promise<Dependency[]> {
        let items: Dependency[] = []
        if (this.hasSwiftPackage()) {
            items.push(new Dependency({
                id: SideTreeItem.ResolvePackages,
                label: isResolvingPackages ? 'Resolving Packages' : isResolvingPackages ? 'Resolved Packages' : 'Resolve Packages',
                icon: isResolvingPackages ? 'sync~spin::charts.yellow' : isResolvingPackages ? 'check::charts.green' : 'clone::charts.yellow'
            }))
        }
        return items
    }
    async settingsItems(): Promise<Dependency[]> { return [] }
    async isThereAnyRecommendation(): Promise<boolean> { return false }
    async recommendationsItems(): Promise<Dependency[]> { return [] }
    async customItems(element: Dependency): Promise<Dependency[]> {
        if (element.id === SideTreeItem.Device) {
            return this.deviceItems()
        }
        return await super.customItems(element)
    }
