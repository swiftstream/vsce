import * as fs from 'fs'
import * as path from 'path'
import JSON5 from 'json5'
import { projectDirectory, sidebarTreeView } from './extension'
import { window } from 'vscode'
import { AbortHandler } from './bash'
import { AndroidStream } from './streams/android/androidStream'
import { LogLevel, print } from './streams/stream'

export class AndroidStreamConfig {
    static defaultPath(): string { return `${projectDirectory}/.vscode/android-stream.json` }

    public static transaction(process: (config: AndroidStreamConfig) => void) {
        let config = new AndroidStreamConfig()
        process(config)
        config.save()
    }

    public static async initializeConfigIfNeeded(stream: AndroidStream): Promise<boolean> {
        const configExists = AndroidStreamConfig.exists()
        let x = new AndroidStreamConfig()
        let startedInspection = false
        const startInspection = () => {
            if (!startedInspection) {
                startedInspection = true
                print(`🕵️ Checking stream config`, LogLevel.Detailed)
            }
        }
        if (!configExists) startInspection()
        if (!x.config.name) {
            startInspection()
            let swiftPackageName = ''
            try {
                swiftPackageName = await stream.swift.getPackageName({ fresh: false })
            } catch {
                swiftPackageName = path.basename(projectDirectory!)
            }
            const name = await window.showInputBox({
                title: 'Project Name',
                value: swiftPackageName,
                placeHolder: 'How would you name it?',
                prompt: 'Choose the name for your project'
            })
            if (!name || name.length === 0) {
                return false
            } 
            x.config.name = name
        }
        if (!x.config.packageName) {
            startInspection()
            const packageName = await window.showInputBox({
                title: 'Java Library Namespace',
                value: '',
                placeHolder: 'e.g. com.my.lib',
                prompt: 'Choose the namespace for your java library'
            })
            if (!packageName || packageName.length === 0) {
                return false
            } 
            x.config.packageName = packageName
        }
        if (x.config.minSDK === 0) {
            startInspection()
            const minSDK = await window.showQuickPick([
                '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35'
            ], {
                title: 'Android Min SDK Version',
                placeHolder: `Choose Android Min SDK Version`
            })
            if (!minSDK) {
                return false
            }
            x.config.minSDK = parseInt(minSDK)
        }
        if (x.config.compileSDK === 0) {
            startInspection()
            const compileSdk = await window.showQuickPick([
                '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35'
            ], {
                title: 'Android Compile SDK Version',
                placeHolder: `Choose Android SDK Version`
            })
            if (!compileSdk) {
                return false
            }
            x.config.compileSDK = parseInt(compileSdk)
        }
        if (x.config.javaVersion === 0) {
            startInspection()
            const javaVersion = await window.showQuickPick([
                '11'
            ], {
                title: 'Java Version',
                placeHolder: `Choose Java Version`
            })
            if (!javaVersion) {
                return false
            }
            x.config.javaVersion = parseInt(javaVersion)
        }
        if (!configExists) {
            startInspection()
            const soMode = await window.showQuickPick([{
                label: 'Packed',
                detail: 'automatically based on imports in Swift'
            }, {
                label: 'PickedManually',
                detail: 'manually, you will pick it from the list yourself'
            }], {
                title: 'How to process .so files?',
                placeHolder: `Choose which way you want to process .so files`
            })
            if (!soMode) {
                return false
            }
            x.config.soMode = soMode.label === 'Packed' ? SoMode.Packed : SoMode.PickedManually
            const packageMode = await window.showQuickPick([{
                label: 'App'
            }, {
                label: 'Library'
            }], {
                title: 'Project Mode',
                placeHolder: `Choose App or Library mode`
            })
            if (!packageMode) {
                return false
            }
            x.config.packageMode = packageMode.label === 'App' ? PackageMode.App : PackageMode.Library
        }
        x.save()
        return true
    }
    
    private path: string
    config: Config

    static createIfNeeded() {
        if (!AndroidStreamConfig.exists()) {
            AndroidStreamConfig.transaction(() => {})
        }
    }
    
    constructor() {
        this.path = AndroidStreamConfig.defaultPath()
        if (!AndroidStreamConfig.exists()) {
            this.config = {
                name: '',
                packageName: '',
                packageMode: PackageMode.Library,
                compileSDK: 0,
                minSDK: 0,
                javaVersion: 0,
                soMode: SoMode.Packed,
                schemes: []
            }
        } else {
            this.config = JSON5.parse(fs.readFileSync(this.path, 'utf8'))
        }
    }

    public transaction(process: (config: AndroidStreamConfig) => void) {
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
        return fs.existsSync(AndroidStreamConfig.defaultPath())
    }

    public static schemes(): Scheme[] {
        let config = new AndroidStreamConfig()
        return config.config?.schemes ?? []
    }
    
    public autoselectScheme(): boolean {
        if (!this.config?.selectedScheme && this.config?.schemes && this.config.schemes.length > 0) {
            this.config.selectedScheme = this.config.schemes[0].title
            return this.config.selectedScheme !== undefined
        }
        return false
    }

    public static selectedScheme(): Scheme | undefined {
        let config = new AndroidStreamConfig()
        if (!config.config?.selectedScheme) return undefined
        return config.config.schemes?.find(x => x.title === config.config?.selectedScheme)
    }

    setSelectedScheme(scheme: Scheme) {
        if (this.config) {
            this.config.selectedScheme = scheme.title
        }
    }
}

export async function chooseScheme(
    stream: AndroidStream,
    options: {
        release: boolean,
        abortHandler?: AbortHandler
    }
): Promise<Scheme | undefined> {
    if (await AndroidStreamConfig.initializeConfigIfNeeded(stream) === false) {
        return undefined
    }
    const streamConfig = new AndroidStreamConfig()
    const schemes = AndroidStreamConfig.schemes()
    if (schemes.length > 0) {
        const selectedTitle = await window.showQuickPick(schemes.map(x => x.title), {
            placeHolder: `Select scheme`
        })
        if (!selectedTitle) return undefined
        const selectedScheme = schemes.find(x => x.title === selectedTitle)
        if (!selectedScheme) return undefined
        AndroidStreamConfig.transaction((x) => {
            x.setSelectedScheme(selectedScheme)
            sidebarTreeView?.refresh()
        })
        return selectedScheme
    } else {
        if (await window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Would you like to create a build scheme?'
        }) !== 'Yes') return undefined
        const swiftTargets = await stream.swift.getLibraryProducts({
            fresh: false,
            abortHandler: undefined
        })
        const selectedTargets = await window.showQuickPick(swiftTargets, {
            title: 'Swift Targets for Build Scheme',
            placeHolder: `Choose which Swift targets to include into scheme`,
            canPickMany: true
        })
        if (!selectedTargets || selectedTargets.length == 0) return undefined
        const _buildConfiguration = await window.showQuickPick([{
            label: 'Debug'
        }, {
            label: 'Release'
        }], {
            title: 'Build Scheme Configuration',
            placeHolder: `Choose Debug or Release`
        })
        if (!_buildConfiguration) return undefined
        const buildConfiguration: SchemeBuildConfiguration | undefined = _buildConfiguration.label === 'Debug' ? SchemeBuildConfiguration.Debug : SchemeBuildConfiguration.Release
        let title: string | undefined
        title = await window.showInputBox({
            title: 'Build Scheme Name',
            value: '',
            placeHolder: 'How would you name it?',
            prompt: 'Choose the name for your scheme'
        })
        if (!title || title.length == 0) return undefined
        const newScheme = {
            title: title,
            swiftTargets: selectedTargets,
            buildConfiguration: buildConfiguration,
            soFiles: streamConfig.config.soMode === SoMode.Packed ? undefined : [
                'libandroid-execinfo.so',
                'libandroid-spawn.so',
                'libc++_shared.so',
                'libcharset.so',
                'libswift_Builtin_float.so',
                'libswift_Concurrency.so',
                'libswift_Differentiation.so',
                'libswift_math.so',
                'libswift_RegexParser.so',
                'libswift_StringProcessing.so',
                'libswift_Volatile.so',
                'libswiftAndroid.so',
                'libswiftCore.so',
                'libswiftDistributed.so',
                'libswiftObservation.so',
                'libswiftRegexBuilder.so',
                'libswiftSwiftOnoneSupport.so',
                'libswiftSynchronization.so'
            ]
        }
        AndroidStreamConfig.transaction((x) => {
            x.config?.schemes?.push(newScheme)
            x.setSelectedScheme(newScheme)
            sidebarTreeView?.refresh()
        })
        return newScheme
    }
}

export interface Scheme {
    title: string
    swiftTargets: string[]
    buildConfiguration: SchemeBuildConfiguration
    soFiles?: string[] | Record<string, string[]>
    swiftArgs?: string[] | Record<string, string[]>
}

export enum SchemeBuildConfiguration {
    Debug = 'Debug',
    Release = 'Release'
}

export enum PackageMode {
    App = 'App',
    Library = 'Library'
}

export enum SoMode {
    Packed = 'Packed', // automatic from jitpack based on imports
    PickedManually = 'PickedManually' // manually picked from the list
}

export interface Config {
    name: string
    packageMode: PackageMode
    packageName: string
    soMode: SoMode
    minSDK: number
    compileSDK: number
    javaVersion: number
    selectedScheme?: string
    schemes?: Scheme[]
}