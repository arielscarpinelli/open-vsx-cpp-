import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as config from './config';

export class GccFormatProvider implements vscode.DocumentFormattingEditProvider {
    public async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        const clangFormatPath = await config.get<string>('clangFormatPath') || 'clang-format';
        const args = ['-assume-filename=' + document.fileName];

        return new Promise((resolve) => {
            const child = spawn(clangFormatPath, args);
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', data => stdout += data);
            child.stderr.on('data', data => stderr += data);

            child.on('error', err => {
                console.error('clang-format failed to start', err);
                resolve([]);
            });

            child.on('close', code => {
                if (code !== 0) {
                    console.error('clang-format failed', stderr);
                    resolve([]);
                    return;
                }

                const lastLineId = document.lineCount - 1;
                const fullRange = new vscode.Range(0, 0, lastLineId, document.lineAt(lastLineId).text.length);
                resolve([vscode.TextEdit.replace(fullRange, stdout)]);
            });

            child.stdin.write(document.getText());
            child.stdin.end();
        });
    }
}
