import { commands, Uri, Position, Selection, window, workspace, TextEditorRevealType } from 'vscode'

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

export async function openDocumentInEditorOnLine(path: string, line: number, position?: number) {
    const doc = await workspace.openTextDocument(Uri.parse(path))
    await window.showTextDocument(doc, 1, false)
    const startPos = new Position(line - 1, 0)
    const endPos = new Position(line - 1, position ?? 0)
    if (window.activeTextEditor) {
        window.activeTextEditor!.revealRange(
            new Selection(startPos, endPos),
            TextEditorRevealType.InCenter
        )
        window.activeTextEditor!.selection = new Selection(endPos, endPos)
    } else {
        await commands.executeCommand('cursorMove', {
            to: 'up', by:'wrappedLine', value: doc.lineCount
        })
        await commands.executeCommand('cursorMove', {
            to: 'down', by: 'wrappedLine', value: line - 1
        })
        window.activeTextEditor!.revealRange(
            new Selection(startPos, endPos),
            TextEditorRevealType.InCenter
        )
        window.activeTextEditor!.selection = new Selection(endPos, endPos)
    }
}