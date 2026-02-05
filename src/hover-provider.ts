import * as vscode from 'vscode';
import { WorkspaceIndexer } from './indexer';

export class GccHoverProvider implements vscode.HoverProvider {
    constructor(private indexer: WorkspaceIndexer) {}

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            return null;
        }

        const word = document.getText(range);
        const symbols = this.indexer.findSymbols(word);

        if (symbols.length > 0) {
            const contents: vscode.MarkdownString[] = [];
            for (const sym of symbols) {
                let kindStr = vscode.SymbolKind[sym.kind];
                contents.push(new vscode.MarkdownString(`**${sym.name}** (${kindStr})\n\nDefined in: ${sym.location.uri.fsPath}`));
            }
            return new vscode.Hover(contents, range);
        }

        return null;
    }
}
