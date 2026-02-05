import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export async function switchSourceHeader() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const uri = editor.document.uri;
    const ext = path.extname(uri.fsPath).toLowerCase();
    const basename = path.basename(uri.fsPath, ext);
    const dir = path.dirname(uri.fsPath);

    let targetExts: string[] = [];
    if (['.cpp', '.c', '.cc', '.cxx'].includes(ext)) {
        targetExts = ['.h', '.hpp', '.hh', '.hxx'];
    } else if (['.h', '.hpp', '.hh', '.hxx'].includes(ext)) {
        targetExts = ['.cpp', '.c', '.cc', '.cxx'];
    }

    for (const targetExt of targetExts) {
        const targetPath = path.join(dir, basename + targetExt);
        if (fs.existsSync(targetPath)) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
            await vscode.window.showTextDocument(doc);
            return;
        }
    }

    // If not in the same directory, try searching the workspace
    for (const targetExt of targetExts) {
        const files = await vscode.workspace.findFiles(`**/${basename}${targetExt}`, undefined, 1);
        if (files.length > 0) {
            const doc = await vscode.workspace.openTextDocument(files[0]);
            await vscode.window.showTextDocument(doc);
            return;
        }
    }

    vscode.window.showInformationMessage('Corresponding file not found.');
}
