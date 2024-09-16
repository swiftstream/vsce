import { Bash, BashResult } from './bash'
import { LogLevel, print, Webber, webSourcesPath } from './webber'
import { projectDirectory } from './extension'
import * as fs from 'fs'
import { window } from 'vscode'

export class NPM {
    private binPath: string = '/root/.nvm/versions/node/v20.17.0/bin/npm'

    constructor(private webber: Webber, private cwd: string) {

    }

    private async execute(args: string[]): Promise<BashResult> {
        print(`executing npm ${args.join(' ')} at: ${this.cwd}`, LogLevel.Verbose)
        const result = await Bash.execute({
            path: this.binPath,
            description: `get executable target`,
            cwd: this.cwd
        }, args)
        return result
    }

    async install(args: string[] = []): Promise<BashResult> {
        return await this.execute(['install', ...args, '--no-audit', '--no-fund', '--no-progress', '--quiet'])
    }

    async run(args: string[] = []): Promise<BashResult> {
        return await this.execute(['run', ...args])
    }
}