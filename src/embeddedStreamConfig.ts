import * as fs from 'fs'
import JSON5 from 'json5'
import { projectDirectory, sidebarTreeView } from './extension'
import { EmbeddedBuildSystem, EmbeddedStream, stringToBuildSystem } from './streams/embedded/embeddedStream'
import { DevContainerConfig, EmbeddedBranch } from './devContainerConfig'
import { AbortHandler } from './bash'
import { window } from 'vscode'

export const defaultBuildShellScript = 'build.sh'
const defaultBinaryName = 'firmware'
const stm32TargetChipValues: string[] = ['NUCLEO_F103RB', 'STM32F746G_DISCOVERY']
const picoPlatforms: string[] = ['rp2040', 'rp2350', 'rp2350-arm-s', 'rp2350-riscv']
const picoBoards: string[] = ['pico', 'pico2', 'pico_w']
const nrfTargetChips: string[] = ['nrf52840dk/nrf52840']
export function defaultEsp32Chip() { return 'esp32c6' }

export class EmbeddedStreamConfig {
    static defaultPath(): string { return `${projectDirectory}/.vscode/embedded-stream.json` }

    public static transaction(process: (config: EmbeddedStreamConfig) => void) {
        let config = new EmbeddedStreamConfig()
        process(config)
        config.save()
    }
    
    private path: string
    config: Config

    static defaultConfig(): Config {
        return {
            schemes: new Array<Scheme>()
        }
    }

    static createIfNeeded() {
        if (!EmbeddedStreamConfig.exists()) {
            EmbeddedStreamConfig.transaction(() => {})
        }
    }
    
    constructor() {
        this.path = EmbeddedStreamConfig.defaultPath()
        if (!EmbeddedStreamConfig.exists()) {
            this.config = EmbeddedStreamConfig.defaultConfig()
        } else {
            this.config = JSON5.parse(fs.readFileSync(this.path, 'utf8'))
        }
    }

    public transaction(process: (config: EmbeddedStreamConfig) => void) {
        process(this)
        this.save()
    }

    public save() {
        if (!fs.existsSync(`${projectDirectory}/.vscode`)) {
            fs.mkdirSync(`${projectDirectory}/.vscode`)
        }
        const devContainerContent = JSON.stringify(this.config, null, '\t')
        fs.writeFileSync(this.path, devContainerContent, 'utf8')
    }

    public static exists(): boolean {
        return fs.existsSync(EmbeddedStreamConfig.defaultPath())
    }

    public static schemes(): Scheme[] {
        let config = new EmbeddedStreamConfig()
        return config.config.schemes ?? []
    }

    public autoselectScheme(): boolean {
        if (!this.config.selectedScheme && this.config.schemes && this.config.schemes.length > 0) {
            this.config.selectedScheme = this.config.schemes[0].title
            return this.config.selectedScheme !== undefined
        }
        return false
    }

    public static selectedScheme(): Scheme | undefined {
        let config = new EmbeddedStreamConfig()
        if (!config.config.selectedScheme) return undefined
        return config.config.schemes?.find(x => x.title === config.config.selectedScheme)
    }

    setSelectedScheme(scheme: Scheme) {
        this.config.selectedScheme = scheme.title
    }
}

export async function chooseScheme(
    stream: EmbeddedStream,
    options: {
        release: boolean,
        abortHandler?: AbortHandler
    }
): Promise<Scheme | undefined> {
    EmbeddedStreamConfig.createIfNeeded()
    const schemes = EmbeddedStreamConfig.schemes()
    if (schemes.length > 0) {
        const selectedTitle = await window.showQuickPick(schemes.map(x => x.title), {
            placeHolder: `Select scheme`
        })
        if (!selectedTitle) return undefined
        const selectedScheme = schemes.find(x => x.title === selectedTitle)
        if (!selectedScheme) return undefined
        EmbeddedStreamConfig.transaction((x) => {
            x.setSelectedScheme(selectedScheme)
            sidebarTreeView?.refresh()
        })
        return selectedScheme
    } else {
        if (await window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Would you like to create a scheme for target?'
        }) !== 'Yes') return undefined
        let title: string | undefined
        let binaryName = defaultBinaryName
        let shellScript: string | undefined
        let esp32TargetChip: string | undefined
        let nrfTargetChip: string | undefined
        let picoBoard: string | undefined
        let picoPlatform: string | undefined
        let stm32TargetChip: string | undefined
        switch (stream.branch) {
        case EmbeddedBranch.ESP32:
            title = await window.showInputBox({
                title: 'Scheme Name',
                value: 'ESP32-C6',
                placeHolder: 'How would you name it?',
                prompt: 'Choose the name for your scheme'
            })
            if (!title || title.length == 0) return undefined
            esp32TargetChip = await window.showQuickPick(
                DevContainerConfig.getEmbeddedIdfChipTargets(),
                {
                    title: 'ESP32 Configuration',
                    placeHolder: `Choose your ESP32 chip`
                }
            )
            if (!esp32TargetChip) return undefined
            const esp32BinaryName = await window.showInputBox({
                title: 'ESP32 Configuration',
                value: 'main',
                placeHolder: 'Enter output binary file name without extension',
                prompt: 'Output binary file name without extension'
            })
            if (!esp32BinaryName || esp32BinaryName.length == 0) return undefined
            binaryName = esp32BinaryName
            break
        case EmbeddedBranch.NRF:
            title = await window.showInputBox({
                title: 'Scheme Name',
                value: 'NRF',
                placeHolder: 'How would you name it?',
                prompt: 'Choose the name for your scheme'
            })
            if (!title || title.length == 0) return undefined
            nrfTargetChip = await window.showQuickPick(nrfTargetChips, {
                title: 'NRF Configuration',
                placeHolder: `Choose your NRF chip`
            })
            if (!nrfTargetChip) return undefined
            const nrfBinaryName = await window.showInputBox({
                title: 'NRF Configuration',
                value: 'zephyr',
                placeHolder: 'Enter output binary file name without extension',
                prompt: 'Output binary file name without extension'
            })
            if (!nrfBinaryName || nrfBinaryName.length == 0) return undefined
            binaryName = nrfBinaryName
            break
        case EmbeddedBranch.RASPBERRY:
            title = await window.showInputBox({
                title: 'Scheme Name',
                value: 'Pico',
                placeHolder: 'How would you name it?',
                prompt: 'Choose the name for your scheme'
            })
            if (!title || title.length == 0) return undefined
            picoBoard = await window.showQuickPick(picoBoards, {
                title: 'Raspberry Configuration',
                placeHolder: `Choose your Pico board`
            })
            if (!picoBoard) return undefined
            picoPlatform = await window.showQuickPick(picoPlatforms, {
                title: 'Raspberry Configuration',
                placeHolder: `Choose your Pico platform`
            })
            if (!picoPlatform) return undefined
            const picoBinaryName = await window.showInputBox({
                title: 'Raspberry Configuration',
                value: defaultBinaryName,
                placeHolder: 'Enter output binary file name without extension',
                prompt: 'Output binary file name without extension'
            })
            if (!picoBinaryName || picoBinaryName.length == 0) return undefined
            binaryName = picoBinaryName
            break
        case EmbeddedBranch.STM32:
            title = await window.showInputBox({
                title: 'Scheme Name',
                value: 'STM32',
                placeHolder: 'How would you name it?',
                prompt: 'Choose the name for your scheme'
            })
            if (!title || title.length == 0) return undefined
            stm32TargetChip = await window.showQuickPick(stm32TargetChipValues, {
                title: 'STM32 Configuration',
                placeHolder: `Choose your STM32 chip`
            })
            if (!stm32TargetChip) return undefined
            const stm32BinaryName = await window.showInputBox({
                title: 'STM32 Configuration',
                value: defaultBinaryName,
                placeHolder: 'Enter output binary file name without extension',
                prompt: 'Output binary file name without extension'
            })
            if (!stm32BinaryName || stm32BinaryName.length == 0) return undefined
            binaryName = stm32BinaryName
            break
        default:
            title = await window.showInputBox({
                title: 'Scheme Name',
                value: 'My Device',
                placeHolder: 'How would you name it?',
                prompt: 'Choose the name for your scheme'
            })
            if (!title || title.length == 0) return undefined
            const customBinaryName = await window.showInputBox({
                title: 'Custom Configuration',
                value: defaultBinaryName,
                placeHolder: 'Enter output binary file name without extension',
                prompt: 'Output binary file name without extension'
            })
            if (!customBinaryName || customBinaryName.length == 0) return undefined
            binaryName = customBinaryName
        }
        let buildSystem: EmbeddedBuildSystem = stream.detectedBuildSystem
        switch (await window.showQuickPick(['Yes', 'No', 'I don\'t know'], {
            title: 'Build System',
            placeHolder: `${stream.detectedBuildSystem} is your build system, correct?`
        })) {
        case 'No':
            const selectedBuildSystem = await window.showQuickPick([
                EmbeddedBuildSystem.SwiftPM,
                EmbeddedBuildSystem.ShellScript,
                EmbeddedBuildSystem.Makefile,
                EmbeddedBuildSystem.CMake
            ], {
                title: 'Build System',
                placeHolder: `Please choose an appropriate build system`
            })
            if (!selectedBuildSystem) return undefined
            const bs = stringToBuildSystem(selectedBuildSystem)
            if (bs === EmbeddedBuildSystem.Unknown) return undefined
            buildSystem = bs
            break
        default: break
        }
        switch (buildSystem) {
        case EmbeddedBuildSystem.SwiftPM:
            await stream.swift.askToChooseTargetIfNeeded({ release: options.release, abortHandler: options.abortHandler, forceFetch: true, forceChoose: true, withProgress: false })
            const selectedTarget = options.release ? stream.swift.selectedReleaseTarget : stream.swift.selectedDebugTarget
            if (!selectedTarget) return
            binaryName = selectedTarget
            break
        case EmbeddedBuildSystem.ShellScript:
            const shFiles = fs.readdirSync(projectDirectory!, { withFileTypes: true })
                .filter(x => x.isFile() && x.name.endsWith('.sh'))
                .map(x => x.name)
            if (shFiles.length > 0) {
                shellScript = await window.showQuickPick(shFiles, {
                    title: 'Build Configuration',
                    placeHolder: `Choose your build shell script`
                })
            } else {
                shellScript = await window.showInputBox({
                    title: 'Build shell script file name',
                    value: defaultBuildShellScript,
                    placeHolder: 'Enter you .sh file name',
                    prompt: 'Enter it manually since none found in the project folder'
                })
            }
            if (!shellScript) return undefined
            break
        default: break
        }
        if (!title || title.length == 0) return undefined
        const newScheme = await generateEmbeddedStreamScheme(stream, buildSystem, {
            title: title,
            binaryName: binaryName,
            buildConfiguration: SchemeBuildConfiguration.Release,
            shellScript: shellScript,
            esp32TargetChip: esp32TargetChip,
            nrfTargetChip: nrfTargetChip,
            picoBoard: picoBoard,
            picoPlatform: picoPlatform,
            stm32TargetChip: stm32TargetChip
        })
        EmbeddedStreamConfig.transaction((x) => {
            x.config.schemes?.push(newScheme)
            x.setSelectedScheme(newScheme)
            sidebarTreeView?.refresh()
        })
        return newScheme
    }
}

// MARK: Generator

export interface AnyCommand {
    command: string
    args?: string[]
    env?: Record<string, string>
}

export enum PreBuildCommandType {
    Always = 'Always',
    BeforeFreshBuild = 'BeforeFreshBuild'
}

export interface PreBuildCommand extends AnyCommand {
    type: PreBuildCommandType
}

export interface SchemePreBuild {
    commands: PreBuildCommand[]
    env?: Record<string, string>
}

export interface SchemeBuild {
    system: EmbeddedBuildSystem
    commands?: AnyCommand[]
    env?: Record<string, string>
}

export enum SchemeFlashTerminal {
    Host = 'Host',
    Container = 'Container'
}

export interface SchemeFlash {
    terminal: SchemeFlashTerminal
    filesToCopy: string[]
    commands: AnyCommand[]
}

export enum SchemeBuildConfiguration {
    Debug = 'Debug',
    Release = 'Release'
}

export interface Scheme {
    title: string
    buildConfiguration: SchemeBuildConfiguration
    env?: Record<string, string>
    binaryName: string
    buildFolder?: string
    chip: string
    preBuild?: SchemePreBuild
    build: SchemeBuild
    flash?: SchemeFlash
    clean?: AnyCommand
}

export interface Config {
    buildFolder?: string
    selectedScheme?: string
    schemes?: Scheme[]
}

export function buildFolderBySystem(buildSystem: EmbeddedBuildSystem) {
    switch (buildSystem) {
        case EmbeddedBuildSystem.CMake:
            return 'build'
        case EmbeddedBuildSystem.Makefile:
            return 'build'
        case EmbeddedBuildSystem.ShellScript:
            return 'build'
        case EmbeddedBuildSystem.SwiftPM:
            return '.build'
        default:
            return 'build'
    }
}

export async function generateEmbeddedStreamScheme(
    stream: EmbeddedStream,
    buildSystem: EmbeddedBuildSystem,
    options: {
        title: string,
        buildConfiguration: SchemeBuildConfiguration,
        binaryName: string,
        shellScript?: string,
        esp32TargetChip?: string,
        nrfTargetChip?: string,
        picoBoard?: string,
        picoPlatform?: string,
        stm32TargetChip?: string
    }
): Promise<Scheme> {
    const buildFolder = buildFolderBySystem(buildSystem)
    const universalCleanCommand: AnyCommand = {
        command: `[ -d ${buildFolder} ] && rm -rf ${buildFolder}/* ${buildFolder}/.[!.]*`
    }
    function cmakeBuild(env?: Record<string, string>): SchemeBuild {
        return {
            system: EmbeddedBuildSystem.CMake,
            commands: [{ command: 'cmake', args: [ '--build', buildFolder ], env: env }]
        }
    }
    switch (stream.branch) {
        case EmbeddedBranch.ESP32:
            const esp32BinaryName = 'main'
            const esp32TargetChip = options.esp32TargetChip ?? 'esp32c6'
            const esp32BuildToolCommand = 'idf.py'
            const esp32PreBuild: SchemePreBuild = {
                commands: [{
                    type: PreBuildCommandType.BeforeFreshBuild,
                    command: esp32BuildToolCommand,
                    args: ['get_idf']
                }, {
                    type: PreBuildCommandType.BeforeFreshBuild,
                    command: esp32BuildToolCommand,
                    args: ['set-target', esp32TargetChip]
                }]
            }
            const esp32FlashCommand: SchemeFlash = {
                terminal: SchemeFlashTerminal.Host,
                filesToCopy: [
                    `${buildFolder}/bootloader/bootloader.bin`,
                    `${buildFolder}/partition_table/partition-table.bin`,
                    `${buildFolder}/${esp32BinaryName}.bin`
                ],
                commands: [{
                    command: 'python3',
                    args: [
                        '-m', 'esptool',
                        '--chip', esp32TargetChip,
                        '-b', '460800',
                        '--before', 'default_reset',
                        '--after', 'hard_reset',
                        'write_flash',
                        '--flash_mode', 'dio',
                        '--flash_size', '2MB',
                        '--flash_freq', '80m',
                        '0x0', `.flash/bootloader.bin`,
                        '0x8000', `.flash/partition-table.bin`,
                        '0x10000', `.flash/${esp32BinaryName}.bin`
                    ]
                }]
            }
            return {
                title: options.title,
                binaryName: esp32BinaryName,
                buildFolder: buildFolder,
                buildConfiguration: options.buildConfiguration,
                chip: esp32TargetChip,
                preBuild: esp32PreBuild,
                build: {
                    system: buildSystem === EmbeddedBuildSystem.Unknown
                            ? EmbeddedBuildSystem.CMake
                            : buildSystem,
                    commands: [{
                        command: esp32BuildToolCommand,
                        args: [
                            '--build-dir', buildFolder,
                            'build'
                        ]
                    }]
                },
                flash: esp32FlashCommand,
                clean: universalCleanCommand
            }
        case EmbeddedBranch.NRF:
            const nrfTargetChip = options.nrfTargetChip ?? 'nrf52840dk/nrf52840'
            const nrfPreBuild: SchemePreBuild = {
                commands: [{
                    type: PreBuildCommandType.BeforeFreshBuild,
                    command: 'cmake',
                    args: [
                        '-B', buildFolder,
                        '-G', 'Ninja',
                        `-DBOARD=${nrfTargetChip}`,
                        '-DUSE_CCACHE=0',
                        '.'
                    ]
                }]
            }
            const nrfFlashCommand: SchemeFlash = {
                terminal: SchemeFlashTerminal.Host,
                filesToCopy: [
                    `${buildFolder}/zephyr/zephyr.hex`
                ],
                commands: [{
                    command: 'nrfjprog',
                    args: [
                        '--recover',
                        '--program', `.flash/zephyr.hex`,
                        '--verify'
                    ]
                }, {
                    command: 'nrfjprog',
                    args: ['--run']
                }]
            }
            return {
                title: options.title,
                binaryName: 'zephyr',
                buildFolder: buildFolder,
                buildConfiguration: options.buildConfiguration,
                chip: nrfTargetChip,
                preBuild: nrfPreBuild,
                build: cmakeBuild(),
                flash: nrfFlashCommand,
                clean: universalCleanCommand
            }
        case EmbeddedBranch.RASPBERRY:
            const picoBoard = options.picoBoard ?? 'pico'
            const picoPlatform = options.picoPlatform ?? 'rp2040'
            const rpiEnv: Record<string, string> = {
                PICO_BOARD: picoBoard,
                PICO_PLATFORM: picoPlatform
            }
            const rpiPreBuild: SchemePreBuild = {
                commands: [{
                    type: PreBuildCommandType.BeforeFreshBuild,
                    command: 'cmake',
                    args: [
                        '-B', buildFolder,
                        '-G', 'Ninja',
                        '-DCMAKE_EXPORT_COMPILE_COMMANDS=On',
                        '.'
                    ],
                    env: rpiEnv
                }]
            }
            switch (buildSystem) {
                case EmbeddedBuildSystem.CMake:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: picoPlatform,
                        preBuild: rpiPreBuild,
                        build: cmakeBuild(rpiEnv),
                        clean: universalCleanCommand
                    }
                case EmbeddedBuildSystem.Makefile:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: picoPlatform,
                        build: { system: buildSystem },
                        clean: universalCleanCommand
                    }
                case EmbeddedBuildSystem.SwiftPM:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: picoPlatform,
                        build: {
                            system: buildSystem,
                            env: rpiEnv
                        },
                        clean: universalCleanCommand
                    }
                default:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: picoPlatform,
                        build: {
                            system: buildSystem,
                            commands: [{
                                command: options.shellScript ?? 'build.sh',
                                env: rpiEnv
                            }]
                        },
                        clean: universalCleanCommand
                    }
            }
        case EmbeddedBranch.STM32:
            const stm32TargetChip = options.stm32TargetChip ?? 'NUCLEO_F103RB' // STM32F746G_DISCOVERY
            const stm32rpiEnv: Record<string, string> = {
                STM_BOARD: stm32TargetChip
            }
            const stm32CmakePreBuild: SchemePreBuild = {
                commands: [{
                    type: PreBuildCommandType.BeforeFreshBuild,
                    command: 'cmake',
                    args: [
                        '-B', buildFolder,
                        '-G', 'Ninja',
                        '-DUSE_CCACHE=0',
                        '.'
                    ]
                }]
            }
            function stm32FlashCommand(binary: string): SchemeFlash {
                return {
                    terminal: SchemeFlashTerminal.Host,
                    filesToCopy: [
                        `.build/${binary}.hex`
                    ],
                    commands: [{
                        command: 'st-flash',
                        args: [
                            '--format ihex',
                            '--reset',
                            'write', `.flash/${binary}.hex`
                        ]
                    }]
                }
            }
            switch (buildSystem) {
                case EmbeddedBuildSystem.CMake:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: stm32TargetChip,
                        preBuild: stm32CmakePreBuild,
                        build: cmakeBuild(stm32rpiEnv),
                        flash: stm32FlashCommand(options.binaryName),
                        clean: universalCleanCommand
                    }
                case EmbeddedBuildSystem.Makefile:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: stm32TargetChip,
                        build: { system: buildSystem },
                        flash: stm32FlashCommand(options.binaryName),
                        clean: universalCleanCommand
                    }
                case EmbeddedBuildSystem.SwiftPM:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: stm32TargetChip,
                        build: {
                            system: buildSystem,
                            env: stm32rpiEnv
                        },
                        flash: stm32FlashCommand(options.binaryName),
                        clean: universalCleanCommand
                    }
                default:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: stm32TargetChip,
                        build: {
                            system: buildSystem,
                            commands: [{
                                command: options.shellScript ?? 'build.sh',
                                env: stm32rpiEnv
                            }]
                        },
                        flash: stm32FlashCommand(options.binaryName),
                        clean: universalCleanCommand
                    }
            }
        default:
            switch (buildSystem) {
                case EmbeddedBuildSystem.CMake:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: 'unknown',
                        preBuild: {
                            commands: [{
                                type: PreBuildCommandType.BeforeFreshBuild,
                                command: 'cmake',
                                args: [
                                    '-B', buildFolder,
                                    '-G', 'Ninja',
                                    '-DUSE_CCACHE=0',
                                    '.'
                                ]
                            }]
                        },
                        build: cmakeBuild({}),
                        clean: universalCleanCommand
                    }
                case EmbeddedBuildSystem.Makefile:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: 'unknown',
                        build: { system: buildSystem },
                        clean: universalCleanCommand
                    }
                case EmbeddedBuildSystem.SwiftPM:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: 'unknown',
                        build: {
                            system: buildSystem,
                            env: {}
                        },
                        clean: universalCleanCommand
                    }
                default:
                    return {
                        title: options.title,
                        binaryName: options.binaryName,
                        buildFolder: buildFolder,
                        buildConfiguration: options.buildConfiguration,
                        chip: 'unknown',
                        build: {
                            system: buildSystem,
                            commands: [{
                                command: options.shellScript ?? 'build.sh',
                                env: {}
                            }]
                        },
                        clean: universalCleanCommand
                    }
            }
    }
}