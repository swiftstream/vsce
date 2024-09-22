import { Bash, BashResult } from './bash'
import { Webber, webSourcesPath } from './webber'
import { projectDirectory } from './extension'

export enum WebpackMode {
    Development = 'development',
    Production = 'production'
}

export class Webpack {
    private binPath: string = '/root/.nvm/versions/node/v20.17.0/bin/webpack-cli'

    constructor(private webber: Webber) {}

    // TODO: implement config generation
    async createConfig(dev: boolean): Promise<void> {}

    private async execute(args: string[]): Promise<BashResult> {
        const result = await Bash.execute({
            path: this.binPath,
            description: `executing webpack`,
            cwd: `${projectDirectory}/${webSourcesPath}`
        }, args)
        return result
    }

    // https://webpack.js.org/api/cli/#build
    async build(mode: WebpackMode, target: string, isServiceWorker: boolean, relativeOutputPath: string) {
        var args = [
            'build',
            '--define-process-env-node-env', mode,
            '--env', mode, // env.production/development = true
            '--env', `app.target=${target}`,
            '--env', `app.relativeOutputPath=${relativeOutputPath}`
        ]
        if (isServiceWorker)
            args = [...args, '--env', 'app=isServiceWorker']
        const result = await this.execute(args)
        if (result.code != 0) {
            if (result.stderr.length > 0) {
                console.error({packageResolve: result.stderr})
            }
            throw `Unable to build webpack for ${target}`
        }
    }
}