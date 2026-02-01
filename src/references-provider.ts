import * as vscode from 'vscode';
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

        // Search in all indexed files
        const files = await vscode.workspace.findFiles('**/*.{c,cpp,h,hpp}');
        for (const file of files) {
            if (token.isCancellationRequested) return null;

            const doc = await vscode.workspace.openTextDocument(file);
            const text = doc.getText();

            // Simple search for now, could be improved with tree-sitter for better accuracy
            // to avoid matches in comments/strings
            let index = text.indexOf(word);
            while (index !== -1) {
                const startPos = doc.positionAt(index);
                const endPos = doc.positionAt(index + word.length);
                const wordRange = doc.getWordRangeAtPosition(startPos);

                if (wordRange && doc.getText(wordRange) === word) {
                    locations.push(new vscode.Location(file, wordRange));
                }

                index = text.indexOf(word, index + word.length);
            }
        }

        return locations;
    }
}
