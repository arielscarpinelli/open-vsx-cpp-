import * as vscode from 'vscode';
import { GccDiagnostics } from './gcc-diagnostics';
import { JSProjectSymbolProvider } from './symbol-provider';
import { WorkspaceIndexer } from './indexer';
import { GccHoverProvider } from './hover-provider';
import { GccDefinitionProvider } from './definition-provider';
import { GccCompletionProvider } from './completion-provider';
import { switchSourceHeader } from './switch-source-header';
import { GccReferencesProvider } from './references-provider';
import { GccRenameProvider } from './rename-provider';

export async function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('C/C++ GCC');
    context.subscriptions.push(outputChannel);

    const gccDiagnostics = new GccDiagnostics();
    context.subscriptions.push(gccDiagnostics);

    const indexer = new WorkspaceIndexer();
    const symbolProvider = new JSProjectSymbolProvider(indexer);

    // Register Document Symbol Provider
    const selector = [
        { scheme: 'file', language: 'c' },
        { scheme: 'file', language: 'cpp' }
    ];

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider)
    );

    // Register Hover Provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(selector, new GccHoverProvider(indexer))
    );

    // Register Definition Provider
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, new GccDefinitionProvider(indexer))
    );

    // Register Completion Provider
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(selector, new GccCompletionProvider(indexer), '.', '->', ':')
    );

    // Register References Provider
    context.subscriptions.push(
        vscode.languages.registerReferenceProvider(selector, new GccReferencesProvider(indexer))
    );

    // Register Rename Provider
    context.subscriptions.push(
        vscode.languages.registerRenameProvider(selector, new GccRenameProvider(indexer))
    );

    // Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('cpp.switchSourceHeader', switchSourceHeader)
    );

    // Index workspace on startup
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: "Indexing C/C++ workspace..."
    }, async () => {
        await indexer.indexWorkspace();
    });

    // File system watcher for indexing
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{c,cpp,h,hpp}');
    watcher.onDidCreate(uri => indexer.indexFile(uri));
    watcher.onDidChange(uri => indexer.indexFile(uri));
    watcher.onDidDelete(uri => indexer.removeFile(uri));
    context.subscriptions.push(watcher);

    // Diagnostics triggers
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            gccDiagnostics.updateDiagnostics(event.document, true);
            indexer.indexFile(event.document.uri, event.document.getText());
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            gccDiagnostics.updateDiagnostics(document, false);
            indexer.indexFile(document.uri, document.getText());
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document) => {
            gccDiagnostics.updateDiagnostics(document, false);
            indexer.indexFile(document.uri, document.getText());
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
        indexer.indexFile(document.uri, document.getText());
    });

    console.log('C/C++ GCC extension is now active!');
}

export function deactivate() {}
