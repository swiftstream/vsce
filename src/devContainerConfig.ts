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