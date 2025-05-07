import { ShellExecution, Task, TaskExecution, TaskProvider, tasks, TaskScope } from 'vscode'
import { extensionContext } from './extension'


export type BuildCommand = {
    label: string
    command: string
    args?: string[]
    env?: { [key: string]: string }
}

type QueuedBuild = {
    command: BuildCommand
    resolve: (value: boolean) => void
    reject: (reason?: any) => void
}

export interface CancellableTaskRunner {
    cancel()
}

export class EmbeddedBuildTaskRunner implements TaskProvider, CancellableTaskRunner {
    static BuildType = 'EmbeddedBuildTaskRunner'

    private registered = false
    private running = false
    private wasCancelled = false
    private currentExecution?: TaskExecution
    private taskQueue: QueuedBuild[] = []

    constructor() {}

    provideTasks(): Task[] {
        return []
    }

    resolveTask(_task: Task): Task | undefined {
        return undefined
    }

    private registerProviderOnce() {
        if (!this.registered) {
            const disposable = tasks.registerTaskProvider(EmbeddedBuildTaskRunner.BuildType, this)
            extensionContext.subscriptions.push(disposable)
            this.registered = true
        }
    }

    async enqueue(command: BuildCommand): Promise<boolean> {
        this.registerProviderOnce()

        return new Promise<boolean>((resolve, reject) => {
            this.taskQueue.push({ command, resolve, reject })
            if (!this.running) {
                this.runNext()
            }
        })
    }

    private async runNext() {
        if (this.taskQueue.length === 0 || this.wasCancelled) {
            this.running = false
            return
        }

        this.running = true
        const queued = this.taskQueue.shift()!
        const { command, resolve } = queued

        const task = new Task(
            { type: EmbeddedBuildTaskRunner.BuildType },
            TaskScope.Workspace,
            command.label,
            EmbeddedBuildTaskRunner.BuildType,
            new ShellExecution(
                command.command,
                command.args ?? [],
                { env: command.env }
            ),
            []
        )

        const success = await this.runAndWait(task)
        resolve(success)

        if (success && !this.wasCancelled) {
            await this.runNext()
        } else {
            this.running = false
        }
    }

    private runAndWait(task: Task): Promise<boolean> {
        return new Promise((resolve) => {
            const disposable = tasks.onDidEndTaskProcess((e) => {
                if (e.execution.task === task) {
                    disposable.dispose()
                    this.currentExecution = undefined
                    resolve(e.exitCode === 0 && !this.wasCancelled)
                }
            })
            tasks.executeTask(task).then(execution => {
                this.currentExecution = execution
            })
        })
    }

    public cancel() {
        this.wasCancelled = true
        this.taskQueue = [] // clear future tasks
        if (this.currentExecution) {
            this.currentExecution.terminate()
        }
    }
}
