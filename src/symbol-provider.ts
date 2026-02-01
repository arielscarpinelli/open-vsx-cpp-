import * as vscode from 'vscode';

export class JSProjectSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        const text = document.getText();

        // Regex for classes, structs, and namespaces (allowing indentation)
        const containerRegex = /^\s*(?:class|struct|namespace)\s+(\w+)/gm;
        let match;
        while ((match = containerRegex.exec(text)) !== null) {
            const name = match[1];
            const kind = match[0].includes('class') ? vscode.SymbolKind.Class :
                         match[0].includes('struct') ? vscode.SymbolKind.Struct :
                         vscode.SymbolKind.Namespace;

            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            const selectionRange = new vscode.Range(startPos, endPos);

            symbols.push(new vscode.DocumentSymbol(name, '', kind, range, selectionRange));
        }

        // Regex for functions (simplified, allowing indentation)
        // Matches something like "int main(" or "void foo::bar("
        const functionRegex = /^\s*[\w:*&<>]+\s+([\w:<>]+)\s*\([^)]*\)\s*\{/gm;
        while ((match = functionRegex.exec(text)) !== null) {
            const name = match[1];
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            const selectionRange = new vscode.Range(startPos, endPos);

            symbols.push(new vscode.DocumentSymbol(name, '', vscode.SymbolKind.Function, range, selectionRange));
        }

        return symbols;
    }
}
