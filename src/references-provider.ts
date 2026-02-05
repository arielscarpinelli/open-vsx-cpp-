import * as vscode from 'vscode';
import * as fs from 'fs';
import { WorkspaceIndexer } from './indexer';

export class GccReferencesProvider implements vscode.ReferenceProvider {
    constructor(private indexer: WorkspaceIndexer) {}

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Location[]> {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            return null;
        }

        const word = document.getText(range);
        const locations: vscode.Location[] = [];

        const files = await vscode.workspace.findFiles('**/*.{c,cpp,h,hpp}');
        const openDocs = vscode.workspace.textDocuments;

        for (const file of files) {
            if (token.isCancellationRequested) return null;

            let text: string;
            const openDoc = openDocs.find(d => d.uri.toString() === file.toString());
            if (openDoc) {
                text = openDoc.getText();
            } else {
                text = fs.readFileSync(file.fsPath, 'utf8');
            }

            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\/\\*[\\s\\S]*?\\*\\/|\\/\\/.*|"(?:\\\\.|[^"])*"|'(?:\\\\.|[^'])*'|(\\b${escapedWord}\\b)`, 'g');

            let match;
            while ((match = regex.exec(text)) !== null) {
                if (match[1]) {
                    const startPos = this.positionAt(text, match.index);
                    const endPos = this.positionAt(text, match.index + word.length);
                    locations.push(new vscode.Location(file, new vscode.Range(startPos, endPos)));
                }
            }
        }

        return locations;
    }

    private positionAt(text: string, offset: number): vscode.Position {
        let line = 0;
        let lastNewLine = -1;
        for (let i = 0; i < offset; i++) {
            if (text[i] === '\n') {
                line++;
                lastNewLine = i;
            }
        }
        return new vscode.Position(line, offset - lastNewLine - 1);
    }
}
