import {homedir} from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// Gets the config value. Applies ${variable} substitutions.
export async function get<T>(key: string): Promise<T | undefined> {
  const parts = key.split('.');
  const section = parts.length > 1 ? parts[0] : 'cpp';
  const name = parts.length > 1 ? parts[1] : parts[0];

  const val = vscode.workspace.getConfiguration(section).get<T>(name);
  if (val === undefined) return undefined;
  return await substitute(val);
}

// Traverse a JSON value, replacing placeholders in all strings.
async function substitute<T>(val: T): Promise<T> {
  if (typeof val === 'string') {
    const replacementPattern = /\$\{(.*?)\}/g;
    const replacementPromises: Promise<string|undefined>[] = [];
    const matches = val.matchAll(replacementPattern);
    for (const match of matches) {
      // match[1] is the first captured group
      replacementPromises.push(replacement(match[1]));
    }
    const replacements = await Promise.all(replacementPromises);
    val = val.replace(
              replacementPattern,
              // If there's no replacement available, keep the placeholder.
              match => replacements.shift() ?? match) as unknown as T;
  } else if (Array.isArray(val)) {
    val = await Promise.all(val.map(substitute)) as T;
  } else if (typeof val === 'object') {
    // Substitute values but not keys, so we don't deal with collisions.
    const result = {} as {[k: string]: any};
    for (const key in val) {
      result[key] = await substitute(val[key]);
    }
    val = result as T;
  }
  return val;
}

// Subset of substitution variables that are most likely to be useful.
// https://code.visualstudio.com/docs/editor/variables-reference
async function replacement(name: string): Promise<string|undefined> {
  if (name === 'userHome') {
    return homedir();
  }
  if (name === 'workspaceRoot' || name === 'workspaceFolder' ||
      name === 'cwd') {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0)
      return workspaceFolders[0].uri.fsPath;
    if (vscode.window.activeTextEditor !== undefined)
      return path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
    return process.cwd();
  }
  if (name === 'workspaceFolderBasename') {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0)
      return path.basename(workspaceFolders[0].uri.fsPath);
  }
  const envPrefix = 'env:';
  if (name.startsWith(envPrefix))
    return process.env[name.substr(envPrefix.length)] ?? '';
  const configPrefix = 'config:';
  if (name.startsWith(configPrefix)) {
    const config = vscode.workspace.getConfiguration().get(
        name.substr(configPrefix.length));
    return (typeof config === 'string') ? config : undefined;
  }
  const commandPrefix = 'command:';
  if (name.startsWith(commandPrefix)) {
    const commandId = name.substr(commandPrefix.length);
    try {
      return await vscode.commands.executeCommand(commandId);
    } catch (error) {
      console.warn(`Error resolving command '${commandId}':`, error);
      return undefined;
    }
  }

  return undefined;
}
