import * as path from 'path'
import { commands, window } from 'vscode'
import { DevContainerConfig } from '../devContainerConfig'
import { sidebarTreeView } from '../extension'

export async function mountNewItemCommand() {
    let isVolume = false
    const itemAction = 'File or folder from the host machine'
    const volumeAction = 'Volume'
    switch (await window.showQuickPick([itemAction, volumeAction], {
        title: 'Choose what to mount',
        placeHolder: 'Please choose what you would like to mount?'
    })) {
        case itemAction: break
        case volumeAction:
            isVolume = true
            break
        default: return
    }
    const source = await window.showInputBox({
        value: '',
        title: `Enter source: ${isVolume ? 'volume name' : 'absolute path on the host machine'}`,
        placeHolder: isVolume ? 'Enter volume name' : 'Enter absolute path',
        validateInput: text => {
            if (isVolume) {
                if (text.includes('/') || text.includes('\\')) {
                    return `Please enter valid volume name`
                }
                return null
            } else {
                try {
                    path.parse(text)
                    if (!path.isAbsolute(text)) {
                        return 'Path should be absolute'
                    }
                    return null
                } catch (error) {
                    return `${error}`
                }
            }
        }
    })
    if (!source || source.length == 0) return
    const sourceName = path.basename(source)
    let targetPath = `/mnt/${sourceName}`
    if (isVolume) {
        const newTarget = await window.showInputBox({
            value: '/',
            title: `Enter target: absolute path inside of the container`,
            placeHolder: `Please enter target path`,
            validateInput: p => {
                const foundMount = DevContainerConfig.findMount(m => m.target === p)
                if (foundMount) {
                    return `${targetPath} is already in use`
                } else if (p.trim().length == 0) {
                    return `Path can't be empty`
                } else if (p.trimEnd() === '/' || p.startsWith('//')) {
                    return `Can't mount to /`
                } else if (!path.isAbsolute(p)) {
                    return `Path should be absolute`
                } else if (p.trimEnd() === '/mnt' || p.trimEnd() === '/mnt/') {
                    return `Please complete the path`
                } else if (p.trimEnd() === '/workspace' || p.trimEnd() === '/workspace/') {
                    return `Please complete the path`
                }
                return null
            }
        })
        if (!newTarget || newTarget.length == 0) return
        targetPath = newTarget
    } else {
        const newTarget = await window.showInputBox({
            value: targetPath,
            title: `Enter target path`,
            placeHolder: `Please enter target path`,
            validateInput: p => {
                const foundMount = DevContainerConfig.findMount(m => m.target === p)
                if (foundMount) {
                    return `Unfortunately ${p} is already in use`
                } else if (p.trim().length == 0) {
                    return `Path can't be empty`
                } else if (!path.isAbsolute(p)) {
                    return `Path should be absolute`
                } else if (!p.startsWith('/mnt/') && !p.startsWith('/workspace/')) {
                    return `Path should start with /mnt or /workspace`
                } else if (p.trimEnd() === '/mnt' || p.trimEnd() === '/mnt/') {
                    return `Please complete the path`
                } else if (p.trimEnd() === '/workspace' || p.trimEnd() === '/workspace/') {
                    return `Please complete the path`
                } else if (p.includes('..')) {
                    return `Invalid path`
                }
                return null
            }
        })
        if (!newTarget || newTarget.length == 0) return
        targetPath = newTarget
    }
    DevContainerConfig.transaction(c => c.addOrChangeMount({
        source: source,
        target: targetPath,
        type: isVolume ? 'volume' : 'bind'
    }, m => m.source === source))
    sidebarTreeView?.refresh()
    switch (await window.showInformationMessage(`${isVolume ? 'Volume' : 'The item'} will be mounted at ${isVolume ? targetPath : `/mnt/${targetPath}`} after the continer is rebuilt.`, 'Rebuild Now', 'Later')) {
        case 'Rebuild Now':
            await commands.executeCommand('remote-containers.rebuildContainer')
            break
        default: break
    }
}