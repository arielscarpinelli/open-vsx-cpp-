import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as config from './config';

export interface SymbolInfo {
    name: string;
    kind: vscode.SymbolKind;
    location: vscode.Location;
    containerName?: string;
    description?: string;
}

interface GccNode {
    id: string;
    type: string;
    fields: Map<string, string>;
}

export class WorkspaceIndexer {
    private symbols: Map<string, SymbolInfo[]> = new Map();
    private queue: vscode.Uri[] = [];
    private running = 0;
    private readonly MAX_CONCURRENT = Math.max(1, os.cpus().length - 1);

    constructor() {}

    public async indexWorkspace(): Promise<void> {
        const files = await vscode.workspace.findFiles('**/*.{c,cpp,h,hpp}');
        for (const file of files) {
            this.enqueue(file);
        }
    }

    public indexFile(uri: vscode.Uri): void {
        this.enqueue(uri);
    }

    private enqueue(uri: vscode.Uri): void {
        // Avoid duplicate in queue
        if (this.queue.some(u => u.toString() === uri.toString())) {
            return;
        }
        this.queue.push(uri);
        this.processQueue();
    }

    private async processQueue(): Promise<void> {
        if (this.running >= this.MAX_CONCURRENT || this.queue.length === 0) {
            return;
        }

        const uri = this.queue.shift()!;
        this.running++;

        try {
            await this.doIndexFile(uri);
        } finally {
            this.running--;
            this.processQueue();
        }
    }

    private async doIndexFile(uri: vscode.Uri): Promise<void> {
        try {
            if (!(await this.fileExists(uri))) {
                this.removeFile(uri);
                return;
            }

            const gccPath = await config.get<string>('gccPath') || 'gcc';
            const gccFlags = await config.get<string[]>('gccFlags') || [];
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

            const isCpp = uri.fsPath.endsWith('.cpp') || uri.fsPath.endsWith('.hpp') || uri.fsPath.endsWith('.cc');
            const dumpFlag = isCpp ? '-fdump-lang-raw' : '-fdump-tree-original-raw';

            const tmpDumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-dump-'));
            const dumpPrefix = path.join(tmpDumpDir, 'dump.');

            const args = [
                '-c', uri.fsPath,
                '-o', path.join(tmpDumpDir, 'output.o'),
                dumpFlag,
                `-dumpdir`, dumpPrefix,
                ...gccFlags
            ];

            return new Promise((resolve) => {
                const child = spawn(gccPath, args, { cwd: cwd });
                child.on('close', (code) => {
                    try {
                        const files = fs.readdirSync(tmpDumpDir);
                        const dumpFile = files.find(f => f.startsWith('dump.') && (f.endsWith('.original') || f.endsWith('.raw')));

                        if (dumpFile) {
                            const dumpPath = path.join(tmpDumpDir, dumpFile);
                            const content = fs.readFileSync(dumpPath, 'utf8');
                            const nodes = this.parseGccDump(content);
                            const fileSymbols = this.extractSymbolsFromNodes(nodes, uri);

                            this.removeFile(uri);
                            for (const sym of fileSymbols) {
                                const existing = this.symbols.get(sym.name) || [];
                                existing.push(sym);
                                this.symbols.set(sym.name, existing);
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing GCC dump', e);
                    } finally {
                        if (fs.existsSync(tmpDumpDir)) {
                            fs.rmSync(tmpDumpDir, { recursive: true, force: true });
                        }
                        resolve();
                    }
                });
            });

        } catch (e) {
            console.error(`Failed to index file ${uri.fsPath}`, e);
        }
    }

    private parseGccDump(content: string): Map<string, GccNode> {
        const nodes = new Map<string, GccNode>();
        const lines = content.split('\n');
        let currentNode: GccNode | null = null;

        for (const line of lines) {
            const nodeMatch = line.match(/^@(\d+)\s+([a-z0-9_]+)\s*(.*)/);
            if (nodeMatch) {
                const id = nodeMatch[1];
                const type = nodeMatch[2];
                const fieldsStr = nodeMatch[3];
                currentNode = { id, type, fields: new Map() };
                nodes.set(id, currentNode);
                this.parseFields(fieldsStr, currentNode.fields);
            } else if (currentNode && line.startsWith(' ')) {
                this.parseFields(line.trim(), currentNode.fields);
            }
        }
        return nodes;
    }

    private parseFields(fieldsStr: string, fields: Map<string, string>) {
        const fieldRegex = /([a-z_]+):\s*(@\d+|[^\s]+)/g;
        let match;
        while ((match = fieldRegex.exec(fieldsStr)) !== null) {
            fields.set(match[1], match[2]);
        }
    }

    private extractSymbolsFromNodes(nodes: Map<string, GccNode>, uri: vscode.Uri): SymbolInfo[] {
        const symbols: SymbolInfo[] = [];
        const fileName = path.basename(uri.fsPath);

        for (const node of nodes.values()) {
            if (['function_decl', 'var_decl', 'type_decl', 'namespace_decl', 'class_specifier', 'struct_specifier', 'enum_specifier'].includes(node.type)) {
                const nameId = node.fields.get('name');
                const srcp = node.fields.get('srcp');

                if (nameId && nameId.startsWith('@') && srcp) {
                    const nameNode = nodes.get(nameId.substring(1));
                    const name = nameNode?.fields.get('strg') || nameNode?.fields.get('name') || '';

                    if (name && srcp.includes(fileName)) {
                        const parts = srcp.split(':');
                        let line = parseInt(parts[parts.length - 1]);
                        if (parts.length >= 3) {
                            const possibleLine = parseInt(parts[parts.length - 2]);
                            if (!isNaN(possibleLine)) {
                                line = possibleLine;
                            }
                        }

                        if (!isNaN(line)) {
                            let kind = vscode.SymbolKind.Variable;
                            if (node.type === 'function_decl') kind = vscode.SymbolKind.Function;
                            else if (node.type === 'namespace_decl') kind = vscode.SymbolKind.Namespace;
                            else if (node.type === 'class_specifier') kind = vscode.SymbolKind.Class;
                            else if (node.type === 'struct_specifier') kind = vscode.SymbolKind.Struct;
                            else if (node.type === 'enum_specifier') kind = vscode.SymbolKind.Enum;
                            else if (node.type === 'type_decl') kind = vscode.SymbolKind.Interface;

                            symbols.push({
                                name: name.replace(/"/g, ''),
                                kind: kind,
                                location: new vscode.Location(uri, new vscode.Position(line - 1, 0))
                            });
                        }
                    }
                }
            }
        }
        return symbols;
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
