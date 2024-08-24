import * as fs from 'fs'
import { Uri, window, workspace, WorkspaceEdit } from "vscode";
import { extensionContext } from "../extension";

export async function copyFile(
    sourcePath: string,
    destPath: string
): Promise<boolean> {
    try {
        fs.copyFileSync(Uri.file(extensionContext.asAbsolutePath(sourcePath)).path, destPath)
        return true
    } catch (err) {
        window.showErrorMessage(`${err?.toString()}`)
        return false
    }
}