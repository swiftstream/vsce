import { commands, window } from "vscode";

export async function rebuildContainer(options?: { noCache: boolean }) {
    if (await window.showQuickPick([
        'Rebuild',
        'Cancel'
    ], {
        title: `Rebuilding dev container${options?.noCache === true ? ' without cache' : ''}`,
        placeHolder: 'Are you sure you want to rebuild dev container?'
    }) == 'Rebuild') {
        if (options?.noCache === true) {
            commands.executeCommand('remote-containers.rebuildContainerNoCache')
        } else {
            commands.executeCommand('remote-containers.rebuildContainer')
        }
    }
}