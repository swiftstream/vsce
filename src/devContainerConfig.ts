import * as fs from 'fs'
import JSON5 from 'json5'
import { projectDirectory } from './extension'

export class DevContainerConfig {
    public static transaction(process: (config: DevContainerConfig) => void) {
        let config = new DevContainerConfig()
        process(config)
        config.save()
    }
    
    private path: string
    config: any
    
    constructor(path?: string) {
        this.path = path ?? `${projectDirectory}/.devcontainer/devcontainer.json`
        this.config = JSON5.parse(fs.readFileSync(this.path, 'utf8'))
    }

    public transaction(process: (config: DevContainerConfig) => void) {
        process(this)
        this.save()
    }

    public save() {
        const devContainerContent = JSON.stringify(this.config, null, '\t')
        fs.writeFileSync(this.path, devContainerContent, 'utf8')
    }

    public static checkIfStaticLinuxArtifactURLPresent(): boolean {
        const config = new DevContainerConfig()
        return config.checkIfContainerEnvKeyExists('S_ARTIFACT_STATIC_LINUX_URL')
    }

    public static checkIfAndroidArtifactURLPresent(): boolean {
        const config = new DevContainerConfig()
        return config.checkIfContainerEnvKeyExists('S_ARTIFACT_ANDROID_URL')
    }

    public static checkIfWasiThreadsArtifactURLPresent(): boolean {
        const config = new DevContainerConfig()
        return config.checkIfContainerEnvKeyExists('S_ARTIFACT_WASIP1_THREADS_URL')
    }

    public setStaticLinuxArtifactURL(url: string) {
        this.config.containerEnv.S_ARTIFACT_STATIC_LINUX_URL = url
    }

    public setAndroidArtifactURL(url: string) {
        this.config.containerEnv.S_ARTIFACT_ANDROID_URL = url
    }

    public setWasip1ThreadsArtifactURL(url: string) {
        this.config.containerEnv.S_ARTIFACT_WASIP1_THREADS_URL = url
    }
    
    private checkIfKeyExists(key: string): boolean {
        if (!this.config.hasOwnProperty(key)) return false
        return true
    }
    
    private checkIfContainerEnvKeyExists(key: string): boolean {
        if (!this.checkIfKeyExists('containerEnv')) return false
        const containerEnv = this.config.containerEnv!
        if (!containerEnv.hasOwnProperty('key')) return false
        return true
    }

    // MARK: Ports

    public addOrChangePort(outer: string, inner: string) {
        const newValue = `${outer}:${inner}`
        if (!this.config.appPort) {
            this.config.appPort = [newValue]
        } else {
            const index = this.config.appPort.findIndex((x: string) => x.endsWith(`:${inner}`))
            if (index >= 0) {
                this.config.appPort[index] = newValue
            } else {
                this.config.appPort.push(newValue)
            }
        }
    }

    public removePort(inner: string) {
        if (!this.config.appPort || this.config.appPort.length == 0) {
            return
        }
        const index = this.config.appPort.findIndex((x: string) => x.endsWith(`:${inner}`))
        if (index >= 0) {
            this.config.appPort.splice(index, 1)
        }
    }

    // MARK: Mounts

    public static listMounts(): any[] {
        const config = new DevContainerConfig()
        return config.listMounts()
    }

    public static permanentMountSources = ['swift-toolchains', 'swift-sdks']

    public listMounts(): any[] {
        return this.config.mounts
    }

    public addOrChangeMount(mount: any, search: (mount: any) => boolean) {
        if (!this.config.mounts) {
            this.config.mounts = [mount]
        } else {
            const index = this.config.mounts.findIndex(search)
            if (index >= 0) {
                this.config.mounts[index] = mount
            } else {
                this.config.mounts.push(mount)
            }
        }
    }

    public static findMount(search: (mount: any) => boolean): any | undefined {
        const config = new DevContainerConfig()
        return config.findMount(search)
    }

    public findMount(search: (mount: any) => boolean): any | undefined {
        if (!this.config.mounts || this.config.mounts.length == 0) {
            return undefined
        }
        return this.config.mounts.find(search)
    }

    public removeMount(search: (mount: any) => boolean) {
        if (!this.config.mounts || this.config.mounts.length == 0) {
            return
        }
        const index = this.config.mounts.findIndex(search)
        if (index >= 0) {
            this.config.mounts.splice(index, 1)
        }
    }

    // MARK: Features

    /// Returns feature key
    public hasFeature(repo: string): any {
        const features: any = this.config.features ?? {}
        return Object.keys(features).find((x) => x.startsWith(repo))
    }

    public addFeature(repo: string, version: string, params: any) {
        const key = `${repo}:${version}`
        if (!this.config.features) {
            this.config.features = {}
        }
        this.config.features[key] = params
    }

    public removeFeature(repo: string): boolean {
        if (!this.config.features) return false
        const key = this.hasFeature(repo)
        if (!key) return false
        delete this.config.features[key]
        if (Object.keys(this.config.features).length == 0) {
            delete this.config.features
        }
        return true
    }
}