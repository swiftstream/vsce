export class DockerImage {
    version: number
    nodeVersion: string

    constructor () {
        this.version = Number(process.env.S_IMAGE_VERSION)
        this.nodeVersion = process.env.NODE_VERSION!
    }
}