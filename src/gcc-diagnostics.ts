import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as config from './config';

export class GccDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private timers: Map<string, NodeJS.Timeout> = new Map();
    // Maps a main file URI to the list of file URIs it reported diagnostics for
    private reportedFiles: Map<string, Set<string>> = new Map();

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('gcc');
    }

    public updateDiagnostics(document: vscode.TextDocument, debounce: boolean = true): void {
        if (document.languageId !== 'c' && document.languageId !== 'cpp') {
            return;
        }

        const uri = document.uri.toString();
        if (this.timers.has(uri)) {
            clearTimeout(this.timers.get(uri)!);
        }

        if (debounce) {
            this.timers.set(uri, setTimeout(() => this.runGcc(document), 500));
        } else {
            this.runGcc(document);
        }
    }

    private async runGcc(document: vscode.TextDocument): Promise<void> {
        const gccPath = await config.get<string>('gccPath') || 'gcc';
        const gccFlags = await config.get<string[]>('gccFlags') || [];
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

        const lang = document.languageId === 'c' ? 'c' : 'c++';
        const args = [
            '-x', lang,
            '-fsyntax-only',
            '-fdiagnostics-format=json',
            ...gccFlags,
            '-'
        ];

        const child = spawn(gccPath, args, { cwd: cwd });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => stdout += data);
        child.stderr.on('data', (data) => stderr += data);

        child.on('error', (err) => {
            console.error('Failed to start GCC', err);
        });

        child.on('close', (code) => {
            this.processOutput(document, stdout, stderr, cwd);
        });

        child.stdin.write(document.getText());
        child.stdin.end();
    }

    private processOutput(document: vscode.TextDocument, stdout: string, stderr: string, cwd: string): void {
        const diagnosticsMap: Map<string, vscode.Diagnostic[]> = new Map();
        const mainUri = document.uri.toString();

        const output = stderr || stdout;
        if (!output || output.trim() === '') {
            this.clearPreviousDiagnostics(mainUri);
            this.diagnosticCollection.set(document.uri, []);
            return;
        }

        try {
            const json = JSON.parse(output);
            for (const entry of json) {
                if (entry.kind === 'error' || entry.kind === 'warning' || entry.kind === 'note') {
                    for (const location of entry.locations) {
                        const caret = location.caret;
                        if (caret && caret.file) {
                            const line = Math.max(0, caret.line - 1);
                            const column = Math.max(0, caret.column - 1);

                            // Try to find the word at the position for a better range
                            let range = new vscode.Range(line, column, line, column);
                            if (caret.file === '<stdin>' || caret.file === '-' || caret.file === document.uri.fsPath) {
                                const wordRange = document.getWordRangeAtPosition(new vscode.Position(line, column));
                                if (wordRange) {
                                    range = wordRange;
                                }
                            }

                            const severity = entry.kind === 'error' ? vscode.DiagnosticSeverity.Error :
                                             entry.kind === 'warning' ? vscode.DiagnosticSeverity.Warning :
                                             vscode.DiagnosticSeverity.Information;

                            const diagnostic = new vscode.Diagnostic(range, entry.message, severity);

                            let fileUri: vscode.Uri;
                            if (caret.file === '<stdin>' || caret.file === '-') {
                                fileUri = document.uri;
                            } else if (path.isAbsolute(caret.file)) {
                                fileUri = vscode.Uri.file(caret.file);
                            } else {
                                fileUri = vscode.Uri.file(path.join(cwd, caret.file));
                            }
                            const fileKey = fileUri.toString();

                            if (!diagnosticsMap.has(fileKey)) {
                                diagnosticsMap.set(fileKey, []);
                            }
                            diagnosticsMap.get(fileKey)!.push(diagnostic);
                        }
                    }
                }
            }

            this.clearPreviousDiagnostics(mainUri);

            const newlyReported = new Set<string>();
            for (const [fileKey, diagnostics] of diagnosticsMap.entries()) {
                const fileUri = vscode.Uri.parse(fileKey);
                this.diagnosticCollection.set(fileUri, diagnostics);
                newlyReported.add(fileKey);
            }
            this.reportedFiles.set(mainUri, newlyReported);

            if (!diagnosticsMap.has(mainUri)) {
                this.diagnosticCollection.set(document.uri, []);
            }

        } catch (e) {
            console.error('Failed to parse GCC output', e);
        }
    }

    private clearPreviousDiagnostics(mainUri: string): void {
        const previous = this.reportedFiles.get(mainUri);
        if (previous) {
            for (const fileKey of previous) {
                this.diagnosticCollection.set(vscode.Uri.parse(fileKey), []);
            }
        }
    }

    public clearDiagnostics(document: vscode.TextDocument): void {
        const uri = document.uri.toString();
        this.clearPreviousDiagnostics(uri);
        this.reportedFiles.delete(uri);
        this.diagnosticCollection.delete(document.uri);
    }

    public dispose(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.diagnosticCollection.dispose();
    }
}
