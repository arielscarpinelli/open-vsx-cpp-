import * as vscode from 'vscode';
import { WorkspaceIndexer } from './indexer';

export class JSProjectSymbolProvider implements vscode.DocumentSymbolProvider {
    constructor(private indexer: WorkspaceIndexer) {}

    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
        // We can get the symbols from the indexer which already parsed the file
        const uri = document.uri.toString();
        const allSymbols = this.indexer.getAllSymbols();
        const fileSymbols = allSymbols.filter(s => s.location.uri.toString() === uri);

        return fileSymbols.map(s => {
            const range = s.location.range;
            return new vscode.DocumentSymbol(
                s.name,
                '',
                s.kind,
                range,
                range
            );
        });
    }
}
