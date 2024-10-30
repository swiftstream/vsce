import { TextDocument } from "vscode";
import { isInContainer, projectDirectory } from "../extension";
import { currentDevPort, currentProdPort, isHotRebuildEnabled, LogLevel, print, setPendingNewDevPort, setPendingNewProdPort, webSourcesFolder } from "../webber";
import { generateChecksum } from "../helpers/filesHelper";
import { hotRebuildCSS, hotRebuildHTML, hotRebuildJS, hotRebuildSwift } from "./build";
import { readPortsFromDevContainer } from "../helpers/readPortsFromDevContainer";

var hotReloadHashes: any = {}

export async function onDidSaveTextDocument(document: TextDocument) {
    if (!isInContainer) return
    if (!isHotRebuildEnabled) return
    // if (document.isDirty) return
    if (document.uri.scheme === 'file') {
        const devContainerPath = `${projectDirectory}/.devcontainer/devcontainer.json`
        print(`onDidSaveTextDocument languageId: ${document.languageId}`, LogLevel.Unbearable)
        async function goThroughHashCheck(handler: () => Promise<void>) {
            const oldChecksum = hotReloadHashes[document.uri.path]
            const newChecksum = generateChecksum(document.getText())
            print(`Checking ${document.uri.path.split('/').pop()}\noldChecksum: ${oldChecksum}\nnewChecksum: ${newChecksum}`, LogLevel.Unbearable)
            if (oldChecksum && oldChecksum === newChecksum) {
                print(`Skipping hot realod, file wasn't changed: ${document.uri.path.split('/').pop()}`, LogLevel.Verbose)
            } else {
                try {
                    await handler()
                    hotReloadHashes[document.uri.path] = newChecksum
                } catch (error) {
                    const json = JSON.stringify(error)
                    print(`${document.uri.path.split('/').pop()} failed to hot realod: ${json === '{}' ? error : json}`, LogLevel.Verbose)
                }
            }
        }
        // Swift
        if (['swift'].includes(document.languageId)) {
            // Package.swift
            if (document.uri.path === `${projectDirectory}/Package.swift`) {
                await goThroughHashCheck(async () => {
                    await hotRebuildSwift()
                })
            }
            // Swift sources
            else if (document.uri.path.startsWith(`${projectDirectory}/Sources/`)) {
                const target = `${document.uri.path}`.replace(`${projectDirectory}/Sources/`, '').split('/')[0]
                if (target) {
                    await goThroughHashCheck(async () => {
                        await hotRebuildSwift({ target: target })
                    })
                }
            }
        }
        // Web sources
        else if (document.uri.path.startsWith(`${projectDirectory}/${webSourcesFolder}`)) {
            // CSS
            if (['css', 'scss', 'sass'].includes(document.languageId)) {
                await goThroughHashCheck(async () => {
                    await hotRebuildCSS()
                })
            }
            // JavaScript
            else if (['javascript', 'typescript', 'typescriptreact'].includes(document.languageId) || document.uri.path === `${projectDirectory}/${webSourcesFolder}/tsconfig.json`) {
                await goThroughHashCheck(async () => {
                    await hotRebuildJS({ path: document.uri.path })
                })
            }
            // HTML
            else if (['html'].includes(document.languageId.toLowerCase())) {
                await goThroughHashCheck(async () => {
                    await hotRebuildHTML()
                })
            }
        }
        // VSCode configuration files
        else if (document.languageId === 'jsonc' && document.uri.scheme === 'file') {
            // devcontainer.json
            if (document.uri.path == devContainerPath) {
                const readPorts = await readPortsFromDevContainer()
                if (readPorts.devPortPresent && `${readPorts.devPort}` != currentDevPort) {
                    setPendingNewDevPort(`${readPorts.devPort}`)
                } else {
                    setPendingNewDevPort(undefined)
                }
                if (readPorts.prodPortPresent && `${readPorts.prodPort}` != currentProdPort) {
                    setPendingNewProdPort(`${readPorts.prodPort}`)
                } else {
                    setPendingNewProdPort(undefined)
                }
            }
        }
    }
}