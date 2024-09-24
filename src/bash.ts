import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { isNull } from 'util'
import { LogLevel, print } from './webber'

export class Bash {
    static async which(program: string): Promise<string | null> {
        return new Promise<string | null>((resolve, reject) => {
            const process = spawn('/bin/bash', ['-c', `which ${program}`], { cwd: '/' })
            var errors = ''
			var result = ''
            process.stdout.on('data', function(msg) {
                // print(`stdout: ${msg}`)
				result += msg.toString()
			})
			process.stderr.on('data', function(msg) {
                errors += msg.toString()
			})
			process.on('error', (error) => {
                reject(error)
			})
			process.on('close', (code) => {
				if (code != 0 || result.length <= 0) {
                    return resolve(null)
                }
                resolve(result.replace(/^\s+|\s+$/g, ''))
            })
        })
    }

    static async execute(program: { path?: string | undefined, name?: string | undefined, description: string | undefined, processInstanceHandler?: (instance: ChildProcessWithoutNullStreams) => void | undefined, cwd?: string | undefined, env?: NodeJS.ProcessEnv | undefined }, args: string[] = []): Promise<BashResult> {
        return new Promise(async (resolve, reject) => {
            var path: string | null = null
            if (program.path) {
                path = program.path
            } else if (program.name) {
                path = await Bash.which(program.name)
                if (!path) {
                    const bashError = new BashError({ error: `${program.name} is not available` })
                    print(bashError.description)
                    return reject(bashError)
                }
            }
            const startTime = new Date().getTime()
            const options: { cwd?: string | undefined, env?: NodeJS.ProcessEnv | undefined } = {}
            if (program.cwd)
                options.cwd = program.cwd
            if (program.env)
                options.env = program.env
            // print(`spawn: ${path!} ${args.join(' ')} cwd: ${options.cwd || 'null'}`)
            const process = spawn(path!, args, options)
            if (program.processInstanceHandler)
                program.processInstanceHandler(process)
            var stderr = ''
			var stdout = ''
            process.stdout.on('data', function(msg) {
                const m = msg.toString()
                print(`stdout: ${m.trim()}`, LogLevel.Verbose)
				stdout += m
			})
			process.stderr.on('data', function(msg) {
                const m = msg.toString()
                print(`stderr: ${m.trim()}`, LogLevel.Verbose)
				stderr += m
			})
			process.on('error', (error: any) => {
                const endTime = new Date().getTime()
                const executionTime = Math.round((endTime - startTime) / 1000)
                const bashError = new BashError({ error: error, executionTime: executionTime, description: program.description, stderr: stderr.replace(/^\s+|\s+$/g, ''), stdout: stdout.replace(/^\s+|\s+$/g, '') })
                print(bashError.description) // Don't comment out
                return reject(bashError)
			})
			process.on('close', (_exitCode) => {
                const endTime = new Date().getTime()
                const executionTime = Math.round((endTime - startTime) / 1000)
                const code = _exitCode || 0
				const result = new BashResult(path!, executionTime, code, stderr.replace(/^\s+|\s+$/g, ''), stdout.replace(/^\s+|\s+$/g, ''), program.description)
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
