import * as vscode from 'vscode';
import { GccDiagnostics } from './gcc-diagnostics';
import { JSProjectSymbolProvider } from './symbol-provider';

export async function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('C/C++ GCC');
    context.subscriptions.push(outputChannel);

    const gccDiagnostics = new GccDiagnostics();
    context.subscriptions.push(gccDiagnostics);

    const symbolProvider = new JSProjectSymbolProvider();

    // Register Document Symbol Provider
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            [
                { scheme: 'file', language: 'c' },
                { scheme: 'file', language: 'cpp' }
            ],
            symbolProvider
        )
    );

    // Diagnostics triggers
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            gccDiagnostics.updateDiagnostics(event.document, true);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            gccDiagnostics.updateDiagnostics(document, false);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document) => {
            gccDiagnostics.updateDiagnostics(document, false);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
            gccDiagnostics.clearDiagnostics(document);
        })
    );

    // Update diagnostics for all open documents on activation
    vscode.workspace.textDocuments.forEach((document) => {
        gccDiagnostics.updateDiagnostics(document, false);
    });

    console.log('C/C++ GCC extension is now active!');
}

export function deactivate() {}
