import * as vscode from 'vscode';
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

        // Find all references and replace them
        const files = await vscode.workspace.findFiles('**/*.{c,cpp,h,hpp}');
        for (const file of files) {
            if (token.isCancellationRequested) return null;

            const doc = await vscode.workspace.openTextDocument(file);
            const text = doc.getText();

            let index = text.indexOf(oldName);
            while (index !== -1) {
                const startPos = doc.positionAt(index);
                const endPos = doc.positionAt(index + oldName.length);
                const wordRange = doc.getWordRangeAtPosition(startPos);

                if (wordRange && doc.getText(wordRange) === oldName) {
                    workspaceEdit.replace(file, wordRange, newName);
                }

                index = text.indexOf(oldName, index + oldName.length);
            }
        }

        return workspaceEdit;
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
