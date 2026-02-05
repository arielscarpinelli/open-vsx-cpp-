import * as vscode from 'vscode';
import { WorkspaceIndexer } from './indexer';

export class GccCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private indexer: WorkspaceIndexer) {}

    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const items: vscode.CompletionItem[] = [];

        // Add indexed symbols
        const allSymbols = this.indexer.getAllSymbols();
        const seen = new Set<string>();
        for (const sym of allSymbols) {
            if (!seen.has(sym.name)) {
                const item = new vscode.CompletionItem(sym.name, this.mapKind(sym.kind));
                items.push(item);
                seen.add(sym.name);
            }
        }

        return items;
    }

    private mapKind(kind: vscode.SymbolKind): vscode.CompletionItemKind {
        switch (kind) {
            case vscode.SymbolKind.Class: return vscode.CompletionItemKind.Class;
            case vscode.SymbolKind.Struct: return vscode.CompletionItemKind.Struct;
            case vscode.SymbolKind.Function: return vscode.CompletionItemKind.Function;
            case vscode.SymbolKind.Variable: return vscode.CompletionItemKind.Variable;
            case vscode.SymbolKind.Namespace: return vscode.CompletionItemKind.Module;
            default: return vscode.CompletionItemKind.Text;
        }
    }
}
