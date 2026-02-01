import * as vscode from 'vscode';
import { WorkspaceIndexer } from './indexer';

const CPP_KEYWORDS = [
    'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor', 'bool', 'break', 'case', 'catch', 'char', 'char16_t', 'char32_t', 'class', 'compl', 'const', 'constexpr', 'const_cast', 'continue', 'decltype', 'default', 'delete', 'do', 'double', 'dynamic_cast', 'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq', 'nullptr', 'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'register', 'reinterpret_cast', 'return', 'short', 'signed', 'sizeof', 'static', 'static_assert', 'static_cast', 'struct', 'switch', 'template', 'this', 'thread_local', 'throw', 'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'wchar_t', 'while', 'xor', 'xor_eq'
];

export class GccCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private indexer: WorkspaceIndexer) {}

    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const items: vscode.CompletionItem[] = [];

        // Add keywords
        for (const kw of CPP_KEYWORDS) {
            items.push(new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword));
        }

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
