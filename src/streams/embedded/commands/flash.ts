import * as fs from 'fs'
import * as path from 'path'
import { commands, window } from 'vscode'
import { EmbeddedStream } from '../embeddedStream'
import { AnyCommand, Scheme, SchemeFlashTerminal } from '../../../embeddedStreamConfig'
import { TimeMeasure } from '../../../helpers/timeMeasureHelper'
import { isBuildingDebug, isBuildingRelease, isFlashing, print, status, StatusType } from '../../stream'
import { projectDirectory, sidebarTreeView } from '../../../extension'
import { EmbeddedBranch } from '../../../devContainerConfig'

enum OperatingSystem {
    Linux = 'Linux',
    macOS = 'macOS',
    WSL = 'WSL',
    Windows = 'Windows'
}
export function stringToOperatingSystem(v: string | undefined): OperatingSystem | undefined {
    if (!v) return undefined
    return Object.values(OperatingSystem).includes(v as OperatingSystem)
        ? v as OperatingSystem
        : undefined
}

let cachedOperatingSystem: OperatingSystem | undefined

export async function flashCommand(stream: EmbeddedStream, scheme: Scheme) {
    if (isFlashing) { return }
    const flashDir = path.join(projectDirectory!, '.flash')
    if (fs.existsSync(flashDir)) {
        fs.rmSync(flashDir, { recursive: true, force: true })
    }
    let filesToCopy = scheme.flash?.filesToCopy ?? []
    if (filesToCopy.length === 0) {
        const defaultFirmwareFile = stream.defaultFirmwareFile(scheme)
        if (defaultFirmwareFile && fs.existsSync(path.join(projectDirectory!, defaultFirmwareFile))) {
            filesToCopy.push(defaultFirmwareFile)
        }
    }
    if (filesToCopy.length > 0) {
        if (!fs.existsSync(flashDir)) {
            fs.mkdirSync(flashDir)
        }
        for (let i = 0; i < filesToCopy.length; i++) {
            const file = filesToCopy[i]
            fs.cpSync(path.join(projectDirectory!, file), path.join(flashDir, path.basename(file)))
        }
    }
    if (filesToCopy.length > 0 && (!scheme.flash || scheme.flash!.commands.length === 0)) {
        window.showInformationMessage(`Firmware file has been copied into \`.flash\` directory. Adjust "flash" action in your scheme to make it automatic.`)
        return
    }
    if (!scheme.flash) {
        window.showInformationMessage(`${scheme.title} scheme doesn't have "flash" action.`)
        return
    }
    if (scheme.flash.commands.length === 0) {
        window.showInformationMessage(`${scheme.title} scheme have zero commands in its "flash" action.`)
        return
    }
    if (isBuildingDebug || isBuildingRelease || stream.isAnyHotBuilding()) {
        window.showInformationMessage('Please wait till build completes before trying to flash.')
        return
    }
    stream.setFlashing(true)
    sidebarTreeView?.cleanupErrors()
    sidebarTreeView?.refresh()
    let operatingSystem = cachedOperatingSystem
    if (!operatingSystem) {
        operatingSystem = stringToOperatingSystem(await window.showQuickPick([
            OperatingSystem.Linux,
            OperatingSystem.macOS,
            OperatingSystem.Windows
        ], {
            placeHolder: 'Please choose your current host operating system',
            title: 'Host Operating System'
        }))
        if (operatingSystem) {
            window.showInformationMessage(`Would you like to remember ${operatingSystem} as your host os for this session?`, 'Remember').then(x => {
                if (x !== 'Remember') return
                cachedOperatingSystem = operatingSystem
            })
        }
    }
    if (!operatingSystem) {
        stream.setFlashing(false)
        return
    }
    cachedOperatingSystem = operatingSystem
    if (scheme.flash.terminal === SchemeFlashTerminal.Host) {
        const existingTerminals = new Set(window.terminals.map(t => t.name))
        const existingTeminal = window.terminals.find(t => {
            const tt: any = t.creationOptions
            return tt?.cwd?.scheme === 'vscode-local'
        })
        if (!existingTeminal)
            await commands.executeCommand('workbench.action.terminal.newLocal')
        setTimeout(async () => {
            const newTerminals = window.terminals.filter(t => !existingTerminals.has(t.name))
            if (existingTeminal || newTerminals.length > 0) {
                setTimeout(() => stream.setFlashing(false), 1000)
                const hostTerminal = existingTeminal ?? newTerminals[0]
                hostTerminal.show()
                const oneliner = buildOneliner(
                    scheme.flash!.commands,
                    operatingSystem === OperatingSystem.Windows
                )
                hostTerminal.sendText(oneliner)
            } else {
                stream.setFlashing(false)
                switch (await window.showInformationMessage(
                    `Unable to reach host terminal, please try again`,
                    'Try again'
                )) {
                    case 'Try again':
                        await flashCommand(stream, scheme)
                        break
                    default: break
                }
            }
        }, 1000)
    } else {
        const measure = new TimeMeasure()
        stream.buildTaskRunner.cancel()
        for (let i = 0; i < scheme.flash.commands.length; i++) {
            const command = scheme.flash.commands[i]
            if (await stream.buildTaskRunner.enqueue({
                label: 'Flashing',
                command: command.command,
                args: command.args,
                env: command.env
            }) === false) { stream.setFlashing(false);return }
        }
        measure.finish()
        status('check', `Flashed firmware in ${measure.time}ms`, StatusType.Success)
        print(`✅ Flashed firmware in ${measure.time}ms`)
        console.log(`Flashed firmware in ${measure.time}ms`)
        stream.setFlashing(false)
        sidebarTreeView?.refresh()
    }
}

function buildOneliner(commands: AnyCommand[], isWindows: boolean): string {
    return commands.map(cmd => {
        const envPart = cmd.env
            ? Object.entries(cmd.env)
                .map(([k, v]) => isWindows ? `$env:${k}="${v}"` : `${k}=${v}`)
                .join(isWindows ? '; ' : ' ')
            : ''
        const argsPart = cmd.args?.join(' ') ?? ''
        const full = `${envPart}${envPart ? (isWindows ? '; ' : ' ') : ''}${cmd.command}${argsPart ? ' ' + argsPart : ''}`
        return full
    }).join(isWindows ? '; if ($?) { ' : ' && ') + (isWindows ? ' }'.repeat(commands.length - 1) : '')
}