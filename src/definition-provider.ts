import * as vscode from 'vscode';
import { WorkspaceIndexer } from './indexer';

export class GccDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private indexer: WorkspaceIndexer) {}

    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition> {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            return null;
        }

        const word = document.getText(range);
        const symbols = this.indexer.findSymbols(word);

        if (symbols.length > 0) {
            return symbols.map(sym => sym.location);
        }

        return null;
    }
}
