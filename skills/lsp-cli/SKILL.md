---
name: lsp-cli
description: >
  Semantic code navigation via Language Server Protocol from the terminal.
  Use instead of grep/rg for finding definitions, references, symbols,
  and diagnostics. Works with TypeScript, Python, Go, Rust, C/C++, and
  any LSP-compatible language server.
allowed-tools: bash read
---

# lsp-cli — LSP from the terminal

Query language servers directly from bash — no editor, no extension.
Think `rg` but semantic: understands types, scopes, and project structure.

## Prerequisites

```bash
cargo install --git https://github.com/e4779/lsp-cli.git
```

Repo: https://github.com/e4779/lsp-cli (fork with pi fixes)

```bash
# Verify
lsp-cli detect .
```

## When to use

| Use lsp-cli | Use grep/rg |
|---|---|
| Find WHERE a symbol is defined | Find TEXT occurrences of a string |
| List all symbols/functions in a file | Search for regex patterns |
| Find all references to a symbol | Count matches across files |
| Get diagnostics after editing | Find comments or string literals |
| Understand call hierarchy | Simple text search |

**Rule of thumb:** if you're about to `rg 'class Foo'` or `rg 'function bar'`,
use `lsp-cli list-symbols` or `lsp-cli grep` instead — faster and more precise.

## Core commands (use these 90% of the time)

### list-symbols — your grep replacement for code structure

```bash
# Symbols in one file (fast, always works)
lsp-cli list-symbols --detach --limit 50 src/app.ts

# All symbols across workspace (opens every matching file)
lsp-cli list-symbols --detach --limit 100 .
```

Output: hierarchical symbol tree with line numbers. Use this instead of
`rg '^(export )?(class|interface|function|const)'` — it gives you actual
TypeScript-aware results, not regex matches.

### list-functions — API surface discovery

```bash
lsp-cli list-functions --detach --limit 50 .
```

Compact list of functions/methods/constructors. Use when exploring a new
codebase or checking what a module exports.

### grep — semantic workspace search

```bash
lsp-cli grep UserService --detach --limit 20 .
lsp-cli grep --json UserService --detach --limit 20 .  # for scripts
```

Semantic symbol search across the whole workspace. Better than `rg` for
finding type/function definitions because it uses the language server's
index, not text matching.

**Caveat:** quality varies by LSP server. TypeScript's workspace/symbol
may return fewer results than expected.

### definition / references — deep navigation

```bash
# Find where a symbol is defined
lsp-cli definition UserService --detach --limit 10 .

# Find all usages
lsp-cli references UserService --detach --limit 100 .
```

### diagnostics — check your work

```bash
# After editing, verify no new errors
lsp-cli diagnostics --detach --limit 50 .

# Just file paths with issues
lsp-cli diagnostics --detach -l .
```

## Project setup

```bash
# What LSP servers are available for this project?
lsp-cli detect .

# Which TypeScript servers are known?
lsp-cli servers --lang typescript

# Start a background daemon (keeps server warm between calls)
lsp-cli daemon . --lsp typescript-language-server --idle-timeout 120

# Stop when done
lsp-cli stop-all
```

Always use `--detach` to keep the daemon alive between calls.

## Language-specific notes

### TypeScript/JavaScript
- Server: `typescript-language-server` (npm install -g typescript-language-server typescript)
- Needs `package.json` or `tsconfig.json` in workspace root
- `list-symbols` and `list-functions` work reliably
- `grep` / `definition` / `references` may return empty if project isn't indexed yet — try opening a file first or wait longer

### Python
- Server: `pyright-langserver` (pip install pyright)
- Needs `pyproject.toml` or `setup.py` in workspace root

### Go
- Server: `gopls` (go install golang.org/x/tools/gopls@latest)
- Needs `go.mod` in workspace root

### Rust
- Server: `rust-analyzer` (rustup component add rust-analyzer)
- Needs `Cargo.toml` in workspace root

## Flags worth remembering

| Flag | When |
|---|---|
| `--detach` | Always — reuses daemon, fast |
| `--limit N` | Always — controls output size |
| `--json` | When parsing output programmatically |
| `--lsp NAME` | When auto-detection picks wrong server |
| `--lang LANG` | Narrow to one language |
| `-l` | Only file paths, not full output |
| `--timeout SEC` | Increase from default 10s for slow servers |

## Anti-patterns

- ❌ `rg 'class \w+'` to find class definitions → `lsp-cli list-symbols`
- ❌ `rg 'import.*from'` to find imports → `lsp-cli list-symbols` (it shows structure, not text)
- ❌ Guessing a symbol name and grepping → `lsp-cli list-functions` first, then search
- ❌ Forgetting `--detach` → server starts fresh each time, slow
- ❌ Not using `--limit` → output floods context

## Troubleshooting

| Symptom | Fix |
|---|---|
| `lsp-cli: command not found` | `cargo install --git https://github.com/e4779/lsp-cli.git` |
| `No language server found` | `lsp-cli detect .` to see available servers; install missing ones (`npm install -g typescript-language-server`, etc.) |
| Empty results from `grep` / `definition` | LSP server may not have indexed yet — open a file first: `lsp-cli list-symbols src/app.ts` |
| `grep` returns nothing but `rg` finds it | `grep` uses workspace/symbol which varies by server — fall back to `list-symbols` or `list-functions` |
| Slow first call | Always use `--detach`; consider `lsp-cli daemon .` for long sessions |
| Language-specific LSP not in PATH | Install the server globally (`npm install -g`, `pip install`, `go install`) then re-run `lsp-cli detect .` |
