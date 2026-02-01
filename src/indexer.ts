import * as vscode from 'vscode';
import * as path from 'path';

// Use require for tree-sitter as it's a native module
let Parser: any;
let Cpp: any;
try {
    Parser = require('tree-sitter');
    Cpp = require('tree-sitter-cpp');
} catch (e) {
    console.error('Failed to load tree-sitter', e);
}

export interface SymbolInfo {
    name: string;
    kind: vscode.SymbolKind;
    location: vscode.Location;
    containerName?: string;
    description?: string;
}

export class WorkspaceIndexer {
    private symbols: Map<string, SymbolInfo[]> = new Map();
    private parser: any;

    constructor() {
        if (Parser && Cpp) {
            this.parser = new Parser();
            this.parser.setLanguage(Cpp);
        }
    }

    public async indexWorkspace(): Promise<void> {
        const files = await vscode.workspace.findFiles('**/*.{c,cpp,h,hpp}');
        for (const file of files) {
            await this.indexFile(file);
        }
    }

    public async indexFile(uri: vscode.Uri): Promise<void> {
        try {
            if (!(await this.fileExists(uri))) {
                this.removeFile(uri);
                return;
            }
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();
            const fileSymbols: SymbolInfo[] = [];

            if (this.parser) {
                const tree = this.parser.parse(text);
                this.extractSymbols(tree.rootNode, uri, document, fileSymbols);
            } else {
                // Fallback to regex if tree-sitter is not available
                this.extractSymbolsRegex(text, uri, document, fileSymbols);
            }

            // Update global index
            this.removeFile(uri);

            for (const sym of fileSymbols) {
                const existing = this.symbols.get(sym.name) || [];
                existing.push(sym);
                this.symbols.set(sym.name, existing);
            }
        } catch (e) {
            console.error(`Failed to index file ${uri.fsPath}`, e);
        }
    }

    private extractSymbols(node: any, uri: vscode.Uri, document: vscode.TextDocument, fileSymbols: SymbolInfo[], containerName?: string) {
        let currentContainer = containerName;

        switch (node.type) {
            case 'class_specifier':
            case 'struct_specifier':
            case 'enum_specifier':
            case 'namespace_definition': {
                const nameNode = node.childForFieldName('name');
                if (nameNode) {
                    const name = nameNode.text;
                    const kind = node.type === 'class_specifier' ? vscode.SymbolKind.Class :
                                 node.type === 'struct_specifier' ? vscode.SymbolKind.Struct :
                                 node.type === 'enum_specifier' ? vscode.SymbolKind.Enum :
                                 vscode.SymbolKind.Namespace;

                    fileSymbols.push({
                        name,
                        kind,
                        location: new vscode.Location(uri, new vscode.Position(nameNode.startPosition.row, nameNode.startPosition.column)),
                        containerName
                    });
                    currentContainer = name;
                }
                break;
            }
            case 'type_definition': {
                const declarator = node.childForFieldName('declarator');
                if (declarator) {
                    const nameNode = this.findIdentifier(declarator);
                    if (nameNode) {
                        fileSymbols.push({
                            name: nameNode.text,
                            kind: vscode.SymbolKind.Interface, // Interface is often used for typedefs in VS Code
                            location: new vscode.Location(uri, new vscode.Position(nameNode.startPosition.row, nameNode.startPosition.column)),
                            containerName
                        });
                    }
                }
                break;
            }
            case 'function_definition': {
                const declarator = node.childForFieldName('declarator');
                if (declarator) {
                    // This is a bit simplified, but try to find the identifier
                    const nameNode = this.findIdentifier(declarator);
                    if (nameNode) {
                        fileSymbols.push({
                            name: nameNode.text,
                            kind: vscode.SymbolKind.Function,
                            location: new vscode.Location(uri, new vscode.Position(nameNode.startPosition.row, nameNode.startPosition.column)),
                            containerName
                        });
                    }
                }
                break;
            }
            case 'declaration': {
                // Could be variables
                const declarator = node.childForFieldName('declarator');
                if (declarator) {
                    const nameNode = this.findIdentifier(declarator);
                    if (nameNode) {
                        fileSymbols.push({
                            name: nameNode.text,
                            kind: vscode.SymbolKind.Variable,
                            location: new vscode.Location(uri, new vscode.Position(nameNode.startPosition.row, nameNode.startPosition.column)),
                            containerName
                        });
                    }
                }
                break;
            }
        }

        for (let i = 0; i < node.childCount; i++) {
            this.extractSymbols(node.child(i), uri, document, fileSymbols, currentContainer);
        }
    }

    private findIdentifier(node: any): any {
        if (node.type === 'identifier' || node.type === 'field_identifier') {
            return node;
        }
        for (let i = 0; i < node.childCount; i++) {
            const result = this.findIdentifier(node.child(i));
            if (result) return result;
        }
        return null;
    }

    private extractSymbolsRegex(text: string, uri: vscode.Uri, document: vscode.TextDocument, fileSymbols: SymbolInfo[]) {
        const containerRegex = /^\s*(?:class|struct|namespace)\s+(\w+)/gm;
        let match;
        while ((match = containerRegex.exec(text)) !== null) {
            fileSymbols.push({
                name: match[1],
                kind: match[0].includes('class') ? vscode.SymbolKind.Class :
                      match[0].includes('struct') ? vscode.SymbolKind.Struct :
                      vscode.SymbolKind.Namespace,
                location: new vscode.Location(uri, document.positionAt(match.index))
            });
        }
        const functionRegex = /^\s*[\w:*&<>]+\s+([\w:<>]+)\s*\([^)]*\)\s*\{/gm;
        while ((match = functionRegex.exec(text)) !== null) {
            fileSymbols.push({
                name: match[1],
                kind: vscode.SymbolKind.Function,
                location: new vscode.Location(uri, document.positionAt(match.index))
            });
        }
    }

    public removeFile(uri: vscode.Uri): void {
        const uriString = uri.toString();
        for (const [name, syms] of this.symbols.entries()) {
            const filtered = syms.filter(s => s.location.uri.toString() !== uriString);
            if (filtered.length === 0) {
                this.symbols.delete(name);
            } else {
                this.symbols.set(name, filtered);
            }
        }
    }

    private async fileExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    public findSymbols(name: string): SymbolInfo[] {
        return this.symbols.get(name) || [];
    }

    public getAllSymbols(): SymbolInfo[] {
        const all: SymbolInfo[] = [];
        for (const syms of this.symbols.values()) {
            all.push(...syms);
        }
        return all;
    }
}
