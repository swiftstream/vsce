import { ChildProcessWithoutNullStreams, exec, spawn } from 'child_process'
import { isNull } from 'util'
import { LogLevel, print } from './webber'
import { TimeMeasure } from './helpers/timeMeasureHelper'

export class Bash {
    whichCache: {} = {}
    
    async which(program: string): Promise<string | undefined> {
        return new Promise<string | undefined>((resolve, reject) => {
            const cachedPath = this.whichCache[program]
            if (cachedPath && cachedPath.length > 0) {
                return resolve(cachedPath)
            }
            exec(`/usr/bin/which ${program}`, (error, stdout, stderr) => {
                if (error) {
                    // console.error(`Error: ${error.message}`)
                    // console.error(`Exit code: ${error.code}`)
                    // console.error(`stderr: ${stderr}`)
                    return resolve(undefined)
                }
                resolve(stdout.replace(/^\s+|\s+$/g, ''))
            })
        })
    }

    async execute(program: { path?: string | undefined, name?: string | undefined, description: string | undefined, processInstanceHandler?: (instance: ChildProcessWithoutNullStreams) => void | undefined, cwd?: string | undefined, env?: NodeJS.ProcessEnv | undefined }, args: string[] = []): Promise<BashResult> {
        return new Promise(async (resolve, reject) => {
            var path: string | undefined
            if (program.path) {
                path = program.path
            } else if (program.name) {
                path = await this.which(program.name)
                if (!path) {
                    const bashError = new BashError({ error: `${program.name} is not available` })
                    print(bashError.description)
                    return reject(bashError)
                }
            }
            const measure = new TimeMeasure()
            const options: { cwd?: string | undefined, env?: NodeJS.ProcessEnv | undefined } = {}
            if (program.cwd)
                options.cwd = program.cwd
            if (program.env)
                options.env = program.env
            const process = spawn(path!, args, options)
            if (program.processInstanceHandler)
                program.processInstanceHandler(process)
            var stderr = ''
			var stdout = ''
            process.stdout.on('data', function(msg) {
                const m = msg.toString()
                print(`stdout: ${m.trim()}`, LogLevel.Unbearable)
				stdout += m
			})
			process.stderr.on('data', function(msg) {
                const m = msg.toString()
                print(`stderr: ${m.trim()}`, LogLevel.Unbearable)
				stderr += m
			})
			process.on('error', (error: any) => {
                measure.finish()
                const bashError = new BashError({ error: error, executionTime: measure.time, description: program.description, stderr: stderr.replace(/^\s+|\s+$/g, ''), stdout: stdout.replace(/^\s+|\s+$/g, '') })
                print(bashError.description, LogLevel.Unbearable) // Don't comment out
                return reject(bashError)
			})
			process.on('close', (_exitCode) => {
                measure.finish()
                const code = _exitCode || 0
				const result = new BashResult(path!, measure.time, code, stderr.replace(/^\s+|\s+$/g, ''), stdout.replace(/^\s+|\s+$/g, ''), program.description)
                if (code === null || (code != null && code != 0)) {
                    const bashError = new BashError({ result: result })
                    print(bashError.description) // Don't comment out
                    return reject(bashError)
                }
                resolve(result)
            })
        })
    }
}

export class BashResult {
    executable: string
    executionTime: number
    code: number
    stderr: string
    stdout: string
    description: string | undefined

    constructor (executable: string, executionTime: number, code: number, stderr: string, stdout: string, description?: string | undefined) {
        this.executable = executable
        this.executionTime = executionTime
        this.code = code
        this.stderr = stderr
        this.stdout = stdout
        this.description = description
    }

    error(args: { noDetails?: boolean | undefined, text?: string | undefined }): BashError {
        return new BashError({ result: this, noDetails: args.noDetails, description: args.text })
    }
}

export class BashError {
	executable: string | undefined
    executionTime: number | undefined
	code: number | undefined
    descr: string | undefined
	error: string | undefined
	stderr: string | undefined
	stdout: string | undefined

	constructor (args: { result?: BashResult | undefined, executable?: string | undefined, executionTime?: number | undefined, code?: number | undefined, error?: string | undefined, stderr?: string | undefined, stdout?: string | undefined, description?: string | undefined, noDetails?: boolean | undefined }) {
		if (args.result) {
            this.descr = args.result.description
            if (!args.noDetails) {
                this.executable = args.result.executable
                this.executionTime = args.result.executionTime
                this.code = args.result.code
                this.error = undefined
                this.stderr = args.result.stderr
                this.stdout = args.result.stdout
            }
        } else {
            this.descr = args.description
            if (!args.noDetails) {
                this.executable = args.executable
                this.executionTime = args.executionTime
                this.code = args.code
                this.error = args.error
                this.stderr = args.stderr
                this.stdout = args.stdout
            }
        }
	}

	get description(): string {
		let description = '⛔️'
        if (this.descr) description += ` Unable to ${this.descr}`
		// if (this.executable) description += ` ${this.executable}`
		if (this.code && this.code != 0) {
            if (description.length > 0)
                description += ','
            description += ` exit code ${this.code}`
        }
		if (this.executionTime) description += ` (executed in ${this.executionTime} seconds)`
        if (this.error) description += `\n${this.error}`
		if (this.stderr) description += `\n${this.stderr}`
		if (this.stdout) description += `\n${this.stdout}`
		return description
	}
}
