import * as fs from 'fs'
import * as path from 'path'
import { env } from 'process'
import { ConfigurationChangeEvent, FileDeleteEvent, FileRenameEvent, TextDocument, window } from 'vscode'
import { LogLevel, print, Stream } from '../stream'
import { Dependency } from '../../sidebarTreeView'
import { isInContainer, projectDirectory, sidebarTreeView } from '../../extension'
import { pathToCompiledBinary, Swift, SwiftBuildMode } from '../../swift'
import { buildCommand, hotRebuildSwift } from './commands/build'
import { ReadElf } from '../../readelf'
import { AbortHandler } from '../../bash'
import { AndroidStreamConfig, chooseScheme, Scheme } from '../../androidStreamConfig'

export class AndroidStream extends Stream {
    readelf: ReadElf

    constructor(overrideConfigure: boolean = false) {
        super(true)
        this.readelf = new ReadElf(this)
        if (!overrideConfigure) this.configure()
    }

    currentBuildArch?: DroidBuildArch

    configure() {
        super.configure()
    }

    async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        super.onDidChangeConfiguration(event)

    }

    isDebugBuilt(target: string, arch: DroidBuildArch): boolean {
        return fs.existsSync(pathToCompiledBinary({
            target: target,
            mode: droidBuildArchToSwiftBuildMode(arch),
            release: false
        }))
    }
    
    isReleaseBuilt(target: string, arch: DroidBuildArch): boolean {
        return fs.existsSync(pathToCompiledBinary({
            target: target,
            mode: droidBuildArchToSwiftBuildMode(arch),
            release: true
        }))
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
        AndroidStreamConfig.transaction(x => {
            x.setSelectedScheme(scheme)
        })
        sidebarTreeView?.refresh()
    }
    
    async getSelectedSchemeOrChoose(options: {
        release: boolean,
        abortHandler?: AbortHandler
    }): Promise<Scheme | undefined> {
        const selectedScheme = AndroidStreamConfig.selectedScheme()
        if (selectedScheme) return selectedScheme
        return await chooseScheme(this, {
            release: options.release,
            abortHandler: options.abortHandler
        })
    }

    // MARK: Building

    async buildDebug() {
		await super.buildDebug()
        const scheme = await this.getSelectedSchemeOrChoose({ release: false })
        if (!scheme) return
        await buildCommand(this, scheme)
    }

    async hotRebuildSwift(params?: { target?: string }) {
        hotRebuildSwift(this, {
            target: params?.target
        })
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

export enum DroidBuildArch {
    Arm64 = 'arm64-v8a',
    ArmEabi = 'armeabi-v7a',
    x86_64 = 'x86_64'
}
export function droidBuildArchToSwiftBuildMode(mode: DroidBuildArch): SwiftBuildMode {
    switch (mode) {
        case DroidBuildArch.Arm64:
            return SwiftBuildMode.AndroidArm64
        case DroidBuildArch.ArmEabi:
            return SwiftBuildMode.AndroidArmEabi
        case DroidBuildArch.x86_64:
            return SwiftBuildMode.Androidx86_64
        default:
            return SwiftBuildMode.Standard
    }
}
export function droidBuildArchToSwiftBuildFolder(mode: DroidBuildArch): string {
    switch (mode) {
        case DroidBuildArch.Arm64:
            return path.join(projectDirectory!, '.build', '.droid', `aarch64-unknown-linux-android${env.S_SDK_VERSION ?? Swift.defaultAndroidSDK}`)
        case DroidBuildArch.ArmEabi:
            return path.join(projectDirectory!, '.build', '.droid', `armv7-unknown-linux-androideabi${env.S_SDK_VERSION ?? Swift.defaultAndroidSDK}`)
        case DroidBuildArch.x86_64:
            return path.join(projectDirectory!, '.build', '.droid', `x86_64-unknown-linux-android${env.S_SDK_VERSION ?? Swift.defaultAndroidSDK}`)
    }
}