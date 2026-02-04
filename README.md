# GCC C/C++ Extension (Refactored from Clangd)

This extension provides C/C++ language support using GCC as a backend. It has been refactored to stop using the `clangd` language server.

## Features

- **Diagnostics**: Real-time error and warning reporting using `gcc -fsyntax-only`. Editor buffers are piped to GCC for "as-you-type" feedback.
- **IntelliSense**: Symbol indexing powered by GCC's raw tree dumps (`-fdump-tree-original-raw` or `-fdump-lang-raw`). This ensures support for GCC-specific syntax quirks.
- **Navigation**: "Go to Definition" and "Find All References" (regex-based with comment/string awareness).
- **Refactoring**: Workspace-wide "Rename" support.
- **Formatting**: Document formatting via `clang-format`.
- **Utilities**: "Switch between Source/Header" command.

## Limitations

Since this extension replaces the full `clangd` language server with a lightweight JavaScript implementation:
- **Semantic Accuracy**: Navigation and refactoring use a combination of GCC dump-tree indexing and regular expressions. It may not be as precise as a full AST-based language server in complex cases (e.g., heavily overloaded functions or complex templates).
- **IntelliSense**: Code completion provides a list of workspace symbols and keywords but is currently not fully context-aware (e.g., member access filtering).

## Configuration

- `cpp.gccPath`: Path to the GCC executable (default: `gcc`).
- `cpp.gccFlags`: Additional flags to pass to GCC (e.g., include paths `-I/usr/include`).

## Requirements

- GCC must be installed and available on your PATH.
- `clang-format` must be installed for formatting support.
