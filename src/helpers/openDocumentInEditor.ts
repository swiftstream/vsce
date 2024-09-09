import { commands, Uri, window, workspace } from "vscode"

export async function openDocumentInEditor(path: string, cursorWhereLineContains?: string) {
    const doc = await workspace.openTextDocument(Uri.parse(path))
    await window.showTextDocument(doc, 1, false)
    if (!cursorWhereLineContains) return
    var appPortLine = 0
    for (var i=0; i<doc.lineCount; i++) {
        if (doc.lineAt(i).text.includes(cursorWhereLineContains))
            appPortLine = i
    }
    await commands.executeCommand('cursorMove', {
            to: 'up', by:'wrappedLine', value: doc.lineCount
    })
    await commands.executeCommand('cursorMove', {
        to: 'down', by: 'wrappedLine', value: appPortLine
    })
}