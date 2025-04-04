import * as path from 'path'
import JSON5 from 'json5'
import { Range, TextDocument, TextEditor, window } from 'vscode'

enum OS {
    MacOS, Linux, Windows
}
let os = OS.Linux
let isOpened = false

export function keybindingsFileClosed(doc: TextDocument): boolean {
    if (path.basename(doc.uri.path) !== 'keybindings.json') return false
    isOpened = false
    return true
}

export async function handleIfKeybindingsEditor(editor: TextEditor): Promise<boolean> {
    const filePath = editor.document.uri.fsPath;
    if (path.basename(filePath) !== 'keybindings.json') return false
    if (editor.document.uri.fsPath.includes('Application Support')) {
        os = OS.MacOS
    } else if (editor.document.uri.fsPath.includes('/Code/')) {
        os = OS.Linux
    } else {
        os = OS.Windows
    }
    switch (checkIfContainsAllOurKeybindings(editor)) {
        case CheckResult.Error:
            return false
        case CheckResult.All:
            return true
        case CheckResult.Partially:
            if (isOpened) return true
            isOpened = true
            switch (await window.showInformationMessage('Not all Swift Stream key bindings (Run, Build, Stop, Test) present in this file. Would you like to fix that?', 'Yes', 'No')) {
                case 'Yes':
                    await addOurKeybindings(editor)
                default: break
            }
            return true
        case CheckResult.None:
            if (isOpened) return true
            isOpened = true
            switch (await window.showInformationMessage('Would you like to permanently add Swift Stream key bindings: Run, Build, Stop, Test?', 'Yes', 'No')) {
                case 'Yes':
                    await addOurKeybindings(editor)
                default: break
            }
            return true
    }
}

const bindings = [
    { key: 'ctrl+r', command: 'SwiftStreamRun', when: 'true' },
    { key: 'ctrl+.', command: 'SwiftStreamStop', when: 'true' },
    { key: 'ctrl+b', command: 'SwiftStreamBuild', when: 'true' },
    { key: 'ctrl+u', command: 'SwiftStreamTest', when: 'true' }
]

enum CheckResult {
    All, Partially, None, Error
}

function checkIfContainsAllOurKeybindings(editor: TextEditor): CheckResult {
    const text = editor.document.getText()
    const parsed = JSON5.parse(text)
    if (!Array.isArray(parsed)) {
        console.error('Unable to parse keybindings.json')
        return CheckResult.Error
    }
    const existingCommands: string[] = parsed.map((x: any) => x.command)
    let foundCommands = 0
    for (let i = 0; i < bindings.length; i++) {
        const binding = bindings[i]
        if (existingCommands.includes(binding.command)) {
            foundCommands += 1
            if (foundCommands === bindings.length)
                break
        }
    }
    switch (foundCommands) {
        case 0: return CheckResult.None
        case bindings.length: return CheckResult.All
        default: return CheckResult.Partially
    }
}

async function addOurKeybindings(editor: TextEditor): Promise<boolean> {
    const originalText = editor.document.getText()
    let json = JSON5.parse(originalText)
    if (!Array.isArray(json)) {
        console.error('Unable to parse keybindings.json')
        return false
    }
    json = json.filter(binding => {
        const key = binding.key
        const macKey = binding.mac
        return bindings.findIndex(x => {
            const _macKey = x.key.replace('ctrl+', 'cmd+')
            return x.key === key || _macKey === key || _macKey === macKey
        }) < 0
    }).filter(binding => {
        return bindings.findIndex(x => x.command === binding.command) < 0
    })
    const correctedBindings = bindings.map(x => {
        if (os === OS.MacOS) {
            return {
                key: x.key.replace('ctrl+', 'cmd+'),
                command: x.command,
                when: x.when
            }
        } else {
            return x
        }
    })
    json.push(...correctedBindings)
    const fullRange = new Range(
        editor.document.positionAt(0),
        editor.document.positionAt(originalText.length)
    )
    const newContent = JSON.stringify(json, null, '\t')
    await editor.edit(editBuilder => {
        editBuilder.replace(fullRange, newContent)
    })
    await editor.document.save()
    window.showInformationMessage('Swift Stream keybindings applied successfully!')
    return true
}