import * as fs from 'fs'
import { isRunningCrawlServer, LogLevel, print, setRunningCrawlServer, Webber } from './webber'
import { ShellExecution, Task, TaskProvider, tasks, TaskScope, Terminal } from 'vscode'
import { extensionContext, sidebarTreeView } from './extension'

class CrawlTaskProvider implements TaskProvider {
	static CrawlType = 'crawlserver'
    task?: Task
    command: string
    pathToWasm: string
	
	constructor(command: string, pathToWasm: string) {
        this.command = command
        this.pathToWasm = pathToWasm
    }

	public provideTasks(): Task[] | undefined {
		this.task = new Task(
            { type: CrawlTaskProvider.CrawlType },
            TaskScope.Workspace,
            `Run ${CrawlTaskProvider.CrawlType}`,
            CrawlTaskProvider.CrawlType,
            new ShellExecution(this.command),
            []
        )
        return [this.task]
	}

	public resolveTask(_task: Task): Task | undefined {
		return undefined
	}
}

export class CrawlServer {
    constructor(private webber: Webber) {}

    pathToBin?: string
    isRegistered: boolean = false
    terminal?: Terminal
    provider?: CrawlTaskProvider

    async isInstalled(): Promise<boolean> {
        if (!this.pathToBin) {
            this.pathToBin = await this.webber.bash.which(CrawlTaskProvider.CrawlType)
            return !(this.pathToBin === undefined)
        }
        return true
    }

    async registerTaskProvider(options: {
        pathToWasm: string,
        port?: number,
        processes?: number,
        debug?: boolean
    }) {
        if (!(await this.isInstalled())) {
            return print('🛑 Crawl Server not installed')
        }
        if (this.isRegistered) return
        this.isRegistered = true
        this.provider = new CrawlTaskProvider(await this.command(options), options.pathToWasm)
        const disposable = tasks.registerTaskProvider(CrawlTaskProvider.CrawlType, this.provider)
        extensionContext.subscriptions.push(disposable)
        tasks.onDidStartTaskProcess((e) => {
            if (e.execution.task.name === `Run ${CrawlTaskProvider.CrawlType}`) {
                print(`🕵️‍♂️ Crawl Server started`, LogLevel.Detailed)
                setRunningCrawlServer(true)
                sidebarTreeView?.refresh()
            }
        })
        tasks.onDidEndTaskProcess((e) => {
            if (e.execution.task.name === `Run ${CrawlTaskProvider.CrawlType}`) {
                setRunningCrawlServer(false)
                sidebarTreeView?.refresh()
                if (e.exitCode) {
                    if (e.exitCode === 0) {
                        print(`🛑 Сrawl Server stopped`, LogLevel.Detailed)
                    } else {
                        print(`🛑 Сrawl Server failed with exit code ${e.exitCode}`, LogLevel.Detailed)
                    }
                } else {
                    print(`🛑 Сrawl Server gracefully stopped`, LogLevel.Detailed)
                }
            }
        })
    }

    private async command(options: {
        pathToWasm: string,
        port?: number,
        processes?: number,
        debug?: boolean
    }): Promise<string> {
        if (!(await this.isInstalled())) return ''
        let args: string[] = [options.pathToWasm, '-g']
        if (options.port)
            args.push('-p', `${options.port}`)
        if (options.processes)
            args.push('-c', `${options.processes}`)
        if (options.debug)
            args.push('-d')
        return `${CrawlTaskProvider.CrawlType} ${args.join(' ')}`
    }

    async startStop() {
        if (!isRunningCrawlServer)
            await this.start()
        else
            this.stop()
    }

    private stop() {
        if (!isRunningCrawlServer) return
        const taskExecution = tasks.taskExecutions.find(
            (x) => x.task.name === `Run ${CrawlTaskProvider.CrawlType}`
        )
        if (taskExecution) taskExecution.terminate()
    }

    private async start() {
        if (isRunningCrawlServer) return
        if (this.provider?.pathToWasm) {
            if (!fs.existsSync(this.provider?.pathToWasm)) {
                print(`🛑 Run debug build first.`)
                return
            }
        }
        print(`🕵️‍♂️ Launching Crawl Server`, LogLevel.Detailed)
        if (this.provider?.task) {
            tasks.executeTask(this.provider?.task).then(() => {}, (reason) => {
                print(`🕵️‍♂️ Unable to start Crawl Server: ${reason}`, LogLevel.Detailed)
            })
        } else {
            print(`🕵️‍♂️ Unable to start Crawl Server`, LogLevel.Detailed)
        }
    }
}