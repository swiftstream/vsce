import { window, StatusBarAlignment, commands, ThemeColor, workspace, ConfigurationChangeEvent, FileDeleteEvent, FileRenameEvent, TextDocument } from "vscode"
import { Bash } from "../bash"
import { Pgrep } from "../pgrep"
import { Swift } from "../swift"
import { Toolchain } from "../toolchain"
import { extensionContext, isInContainer, projectDirectory, sidebarTreeView } from "../extension"
import { SideTreeItem } from "../sidebarTreeView"
import { clearBuildCacheCommand } from "../commands/clearBuildCache"
import { toolchainCommand } from "../commands/toolchain"
import { loggingLevelCommand } from "../commands/loggingLevel"
import { discussionsCommand, repositoryCommand, submitAnIssueCommand } from "../commands/support"

export class Stream {
    public bash: Bash
    public toolchain: Toolchain
    public swift: Swift
    public pgrep: Pgrep

    constructor() {
        this.bash = new Bash()
        this.toolchain = new Toolchain(this)
        this.swift = new Swift(this)
        this.pgrep = new Pgrep(this)
        this._configure()
    }

    private _configure = async () => {
        if (!projectDirectory) return
		this.setLoggingLevel()
        workspace.onDidChangeConfiguration((event) => {
            this.onDidChangeConfiguration(event)
        })
    }

    async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        if (event.affectsConfiguration('stream.loggingLevel'))
			this.setLoggingLevel()
    }

    setLoggingLevel(value?: LogLevel) {
        currentLoggingLevel = value ?? workspace.getConfiguration().get('stream.loggingLevel') as LogLevel
        if (value) workspace.getConfiguration().update('stream.loggingLevel', value)
        sidebarTreeView?.refresh()
    }

    onDidRenameFiles(event: FileRenameEvent) {}
    onDidDeleteFiles(event: FileDeleteEvent) {}

    registerCommands() {
        extensionContext.subscriptions.push(commands.registerCommand('clickOnErrorStatusBarItem', () => {
            clearStatus()
            showOutput()
        }))
        extensionContext.subscriptions.push(commands.registerCommand('clickOnSuccessStatusBarItem', () => {
            clearStatus()
            showOutput()
        }))
        extensionContext.subscriptions.push(commands.registerCommand('clickOnStatusBarItem', showOutput))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.ClearBuildCache, clearBuildCacheCommand))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Toolchain, toolchainCommand))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.LoggingLevel, loggingLevelCommand))
        extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Repository, repositoryCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.Discussions, discussionsCommand))
		extensionContext.subscriptions.push(commands.registerCommand(SideTreeItem.SubmitAnIssue, submitAnIssueCommand))
    }

	async onDidSaveTextDocument(document: TextDocument) {
		if (!isInContainer) return
	}
}

// MARK: Toolchain

export var currentToolchain: string = `${getToolchainNameFromURL()}`
export var pendingNewToolchain: string | undefined
export function getToolchainNameFromURL(url: string | undefined = undefined): string | undefined {
    const value: string | undefined = url ?? process.env.S_TOOLCHAIN_URL_X86
    if (!value) return 'undefined'
    return value.split('/').pop()
        ?.replace(/^swift-/, '')
        .replace(/(\.tar\.gz|\.zip)$/, '')
        .replace(/(-ubuntu20\.04|-aarch64|_x86_64|_aarch64|-a)/g, '')
}
export function setPendingNewToolchain(value: string | undefined) {
    if (!isInContainer() && value) {
        currentToolchain = value
        pendingNewToolchain = undefined
    } else {
        pendingNewToolchain = value
    }
    sidebarTreeView?.refresh()
}

// MARK: Building

export var isBuilding = false
export var abortBuilding: (() => void) | undefined
export function setAbortBuilding(handler: () => void | undefined) {
	abortBuilding = handler
}
export function setBuilding(active: boolean) {
	if (!active) abortBuilding = undefined
	isBuilding = active
	commands.executeCommand('setContext', 'isBuilding', active)
}
export var isClearingBuildCache = false
export function setClearingBuildCache(active: boolean) { isClearingBuildCache = active }
export var isClearedBuildCache = false
export function setClearedBuildCache(active: boolean) { isClearedBuildCache = active }

// MARK: Print

export enum LogLevel {
	Normal = 'Normal',
	Detailed = 'Detailed',
	Verbose = 'Verbose',
	Unbearable = 'Unbearable'
}

export var currentLoggingLevel: LogLevel = LogLevel.Normal
export let output = window.createOutputChannel('SwiftStream')
export let problemStatusBarIcon = window.createStatusBarItem(StatusBarAlignment.Left, 0)
export let problemStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 0)

export function clearPrint() {
	output.clear()
}

export function showOutput() {
	output.show()
}
interface ExtendedPrintMessage {
	normal?: string
	detailed?: string
	verbose?: string
	unbearable?: string
}
const isExtendedPrintMessage = (value: any): value is ExtendedPrintMessage => (!!value?.normal || !!value?.detailed || !!value?.verbose || !!value?.unbearable)
export function print(message: string | ExtendedPrintMessage, level: LogLevel = LogLevel.Normal, show: boolean | null = null) {
	if (isExtendedPrintMessage(message)) {
		if (currentLoggingLevel == LogLevel.Normal) {
			if (message.normal) output.appendLine(`${message.normal}`)
		} else if (currentLoggingLevel == LogLevel.Detailed) {
			if (message.detailed) output.appendLine(`${message.detailed}`)
			else if (message.normal) output.appendLine(`${message.normal}`)
		} else if (currentLoggingLevel == LogLevel.Verbose) {
			if (message.verbose) output.appendLine(`${message.verbose}`)
			else if (message.detailed) output.appendLine(`${message.detailed}`)
			else if (message.normal) output.appendLine(`${message.normal}`)
		} else if (currentLoggingLevel == LogLevel.Unbearable) {
			if (message.unbearable) output.appendLine(`${message.unbearable}`)
			else if (message.verbose) output.appendLine(`${message.verbose}`)
			else if (message.detailed) output.appendLine(`${message.detailed}`)
			else if (message.normal) output.appendLine(`${message.normal}`)
		}
	} else {
		if (level == LogLevel.Detailed && currentLoggingLevel == LogLevel.Normal)
			return
		if (level == LogLevel.Verbose && [LogLevel.Normal, LogLevel.Detailed].includes(currentLoggingLevel))
			return
		if (level == LogLevel.Unbearable && [LogLevel.Normal, LogLevel.Detailed, LogLevel.Verbose].includes(currentLoggingLevel))
			return
		var symbol = ''
		if (level == LogLevel.Detailed)
			symbol = ''
		else if (level == LogLevel.Verbose)
			symbol = ''
		else if (level == LogLevel.Unbearable)
			symbol = ''
		output.appendLine(`${symbol}${message}`)
	}
	if (show) output.show()
}

// MARK: Status

export enum StatusType {
	Default, Warning, Error, Success
}

export function clearStatus() {
	problemStatusBarIcon.command = undefined
	problemStatusBarItem.command = undefined
	problemStatusBarIcon.text = ''
	problemStatusBarItem.text = ''
	problemStatusBarIcon.hide()
	problemStatusBarItem.hide()
}

export function status(icon: string | null, message: string, type: StatusType = StatusType.Default, command: string | null = null) {
	if (icon) {
		if (problemStatusBarIcon.text != icon) {
			const splitted = icon.split('::')
			if (splitted.length == 2) {
				problemStatusBarIcon.text = `$(${splitted[0]})`
				problemStatusBarIcon.color = new ThemeColor(`${splitted[1]}`)
			} else {
				problemStatusBarIcon.text = `$(${icon})`
			}
			problemStatusBarIcon.show()
		}
	} else {
		problemStatusBarIcon.text = ''
		problemStatusBarIcon.hide()
	}
	problemStatusBarItem.text = message
	switch (type) {
		case StatusType.Success:
		case StatusType.Default:
			problemStatusBarIcon.backgroundColor = undefined
			problemStatusBarIcon.color = undefined
			problemStatusBarItem.backgroundColor = undefined
			problemStatusBarItem.color = undefined
			problemStatusBarItem.command = type == StatusType.Success ? 'clickOnSuccessStatusBarItem' : 'clickOnStatusBarItem'
			break
		case StatusType.Warning:
			problemStatusBarIcon.backgroundColor = new ThemeColor('statusBarItem.warningBackground')
			problemStatusBarIcon.color = undefined
			problemStatusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground')
			problemStatusBarItem.color = undefined
			problemStatusBarItem.command = 'clickOnErrorStatusBarItem'
			break
		case StatusType.Error:
			problemStatusBarIcon.backgroundColor = new ThemeColor('statusBarItem.errorBackground')
			problemStatusBarIcon.color = new ThemeColor('errorForeground')
			problemStatusBarItem.backgroundColor = new ThemeColor('statusBarItem.errorBackground')
			problemStatusBarItem.color = new ThemeColor('errorForeground')
			problemStatusBarItem.command = 'clickOnErrorStatusBarItem'
			break
	}
	problemStatusBarIcon.command = command ?? problemStatusBarIcon.command
	problemStatusBarItem.command = command ?? problemStatusBarItem.command
	problemStatusBarItem.show()
}
export function buildStatus(text: string) {
	status('sync~spin', text, StatusType.Default)
}
