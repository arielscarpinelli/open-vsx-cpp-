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
    // Maps a file URI to the list of symbols it contains
    private fileSymbols: Map<string, SymbolInfo[]> = new Map();
    private queue: { uri: vscode.Uri, content?: string }[] = [];
    private running = 0;
    private readonly MAX_CONCURRENT = Math.max(1, os.cpus().length - 1);

    constructor() {}

    public async indexWorkspace(): Promise<void> {
        const files = await vscode.workspace.findFiles('**/*.{c,cpp,h,hpp}');
        for (const file of files) {
            this.enqueue(file);
        }
    }

    public indexFile(uri: vscode.Uri, content?: string): void {
        this.enqueue(uri, content);
    }

    private enqueue(uri: vscode.Uri, content?: string): void {
        // Avoid duplicate in queue, but update content if provided
        const index = this.queue.findIndex(u => u.uri.toString() === uri.toString());
        if (index !== -1) {
            this.queue[index].content = content;
            return;
        }
        this.queue.push({ uri, content });
        this.processQueue();
    }

    private async processQueue(): Promise<void> {
        if (this.running >= this.MAX_CONCURRENT || this.queue.length === 0) {
            return;
        }

        const task = this.queue.shift()!;
        this.running++;

        try {
            await this.doIndexFile(task.uri, task.content);
        } finally {
            this.running--;
            this.processQueue();
        }
    }

    private async doIndexFile(uri: vscode.Uri, content?: string): Promise<void> {
        try {
            if (!content && !(await this.fileExists(uri))) {
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

            let args: string[];
            if (content) {
                const lang = isCpp ? 'c++' : 'c';
                args = [
                    '-x', lang,
                    '-c', '-',
                    '-o', path.join(tmpDumpDir, 'output.o'),
                    dumpFlag,
                    `-dumpdir`, dumpPrefix,
                    ...gccFlags
                ];
            } else {
                args = [
                    '-c', uri.fsPath,
                    '-o', path.join(tmpDumpDir, 'output.o'),
                    dumpFlag,
                    `-dumpdir`, dumpPrefix,
                    ...gccFlags
                ];
            }

            return new Promise((resolve) => {
                const child = spawn(gccPath, args, { cwd: cwd });

                child.on('error', (err) => {
                    console.error('Failed to start GCC for indexing', err);
                    resolve();
                });

                child.on('close', (code) => {
                    try {
                        const files = fs.readdirSync(tmpDumpDir);
                        const dumpFile = files.find(f => f.startsWith('dump.') && (f.endsWith('.original') || f.endsWith('.raw')));

                        if (dumpFile) {
                            const dumpPath = path.join(tmpDumpDir, dumpFile);
                            const dumpContent = fs.readFileSync(dumpPath, 'utf8');
                            const nodes = this.parseGccDump(dumpContent);
                            const symbols = this.extractSymbolsFromNodes(nodes, uri);

                            this.fileSymbols.set(uri.toString(), symbols);
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

                if (content) {
                    child.stdin.write(content);
                    child.stdin.end();
                }
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

                    // Note: when using stdin, fileName might be <stdin>
                    if (name && (srcp.includes(fileName) || srcp.includes('<stdin>'))) {
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
        this.fileSymbols.delete(uri.toString());
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
        const found: SymbolInfo[] = [];
        for (const symbols of this.fileSymbols.values()) {
            for (const sym of symbols) {
                if (sym.name === name) {
                    found.push(sym);
                }
            }
        }
        return found;
    }

    public getAllSymbols(): SymbolInfo[] {
        const all: SymbolInfo[] = [];
        for (const symbols of this.fileSymbols.values()) {
            all.push(...symbols);
        }
        return all;
    }
}
