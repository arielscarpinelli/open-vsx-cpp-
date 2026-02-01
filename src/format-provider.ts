import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

export class GccFormatProvider implements vscode.DocumentFormattingEditProvider {
    public provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {
            const filePath = document.uri.fsPath;
            // Try to find clang-format in node_modules or path
            const clangFormatPath = 'clang-format';

            const command = `${clangFormatPath} "${filePath}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('clang-format failed', stderr);
                    resolve([]);
                    return;
                }

                const lastLineId = document.lineCount - 1;
                const fullRange = new vscode.Range(0, 0, lastLineId, document.lineAt(lastLineId).text.length);
                resolve([vscode.TextEdit.replace(fullRange, stdout)]);
            });
        });
    }
}
