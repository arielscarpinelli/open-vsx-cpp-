import * as vscode from 'vscode';
import * as fs from 'fs';
import { WorkspaceIndexer } from './indexer';

export class GccRenameProvider implements vscode.RenameProvider {
    constructor(private indexer: WorkspaceIndexer) {}

    public async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.WorkspaceEdit> {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            return null;
        }

        const oldName = document.getText(range);
        const workspaceEdit = new vscode.WorkspaceEdit();

        const files = await vscode.workspace.findFiles('**/*.{c,cpp,h,hpp}');
        const openDocs = vscode.workspace.textDocuments;

        for (const file of files) {
            if (token.isCancellationRequested) return null;

            let text: string;
            const openDoc = openDocs.find(d => d.uri.toString() === file.toString());
            if (openDoc) {
                text = openDoc.getText();
            } else {
                text = fs.readFileSync(file.fsPath, 'utf8');
            }

            const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\/\\*[\\s\\S]*?\\*\\/|\\/\\/.*|"(?:\\\\.|[^"])*"|'(?:\\\\.|[^'])*'|(\\b${escapedOldName}\\b)`, 'g');

            let match;
            while ((match = regex.exec(text)) !== null) {
                if (match[1]) {
                    const startPos = this.positionAt(text, match.index);
                    const endPos = this.positionAt(text, match.index + oldName.length);
                    workspaceEdit.replace(file, new vscode.Range(startPos, endPos), newName);
                }
            }
        }

        return workspaceEdit;
    }

    private positionAt(text: string, offset: number): vscode.Position {
        let line = 0;
        let lastNewLine = -1;
        for (let i = 0; i < offset; i++) {
            if (text[i] === '\n') {
                line++;
                lastNewLine = i;
            }
        }
        return new vscode.Position(line, offset - lastNewLine - 1);
    }

    public prepareRename?(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            throw new Error('You cannot rename this element.');
        }
        return range;
    }
}
