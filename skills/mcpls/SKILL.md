---
name: mcpls
description: >
  Semantic code navigation via LSP through the mcpls MCP→LSP bridge
  (mcporter call --stdio mcpls). Find definitions, references, hover types,
  workspace symbols, diagnostics, call hierarchy, rename refactoring, and
  completions — all compiler-accurate, not text-level guesses. Use instead of
  grep/rg when you need to know WHERE a symbol is defined, WHAT type it is,
  WHO calls a function, or WHAT diagnostics exist — not just find text
  occurrences. Works with Rust, TypeScript, Python, Go, C/C++, Zig and more.
  Wraps `mcporter call --stdio mcpls` so the 15-tool schema stays out of
  context until needed.
allowed-tools: bash read
---

# mcpls (MCP→LSP bridge)

Give AI agents compiler-accurate code understanding through Language Server Protocol —
type inference, cross-references, semantic navigation, real diagnostics. Single
Rust binary, no Node.js/Python runtime needed.

See the [mcporter skill](../mcporter/SKILL.md) for mcporter basics (call syntax,
ad-hoc stdio servers, output control).

## Prerequisites

```bash
mcpls --version                              # installed? (cargo install mcpls)
cd /path/to/project                          # mcpls needs cwd = project root
mcporter call --stdio mcpls --tool get_server_logs --args '{}'  # smoke test
```

Missing? `cargo install mcpls`. Language servers (at least one needed):

```bash
rustup component add rust-analyzer        # Rust (zero-config)
npm install -g typescript-language-server typescript  # TypeScript
npm install -g pyright                    # Python
go install golang.org/x/tools/gopls@latest  # Go
```

mcpls auto-detects servers from project markers (Cargo.toml, package.json,
pyproject.toml, go.mod, etc.). Default config at `~/.config/mcpls/mcpls.toml`
covers all major languages out of the box.

## When to use

| Use mcpls | Use grep/rg |
|---|---|
| Find WHERE a symbol is defined | Find TEXT occurrences of a string |
| List all symbols/functions in a file | Search for regex patterns |
| Find all references to a symbol | Count matches across files |
| Get type info (hover) | Find comments or string literals |
| Get compiler diagnostics | Simple text search |
| Rename a symbol workspace-wide | |
| Trace call hierarchy (who calls what) | |

**Don't** use mcpls for plain text search or pattern matching — grep/rg is
faster and more direct for that.

## Core workflow

```
cd to project → mcporter call --stdio mcpls --tool <tool> --args '{"file_path":"<relative>","line":N,"character":N}'
```

Three rules to get right:

1. **`cd` to the project root first** — mcpls inherits cwd, auto-detects
   workspace markers from there. Do NOT use `--root` (it's a mcporter flag,
   not passed through to mcpls).

2. **File paths must be relative** to project root. Absolute paths cause
   `"path outside workspace"` errors.

3. **Positions are 1-based** — line 1, character 1 = first character. Use line
   numbers from `read` / `bat` directly (mcpls translates to 0-based LSP
   internally).

Minimal example:

```bash
cd /path/to/project
mcporter call --stdio mcpls --tool get_hover --args '{"file_path":"src/main.rs","line":10,"character":5}'
```

## Top tools

All calls follow `cd <project> && mcporter call --stdio mcpls --tool <tool> --args '<json>'`.

### Code Intelligence

```bash
# What type/signature is at this position?
mcporter call --stdio mcpls --tool get_hover --args '{"file_path":"src/lib.rs","line":42,"character":8}'

# Jump to definition
mcporter call --stdio mcpls --tool get_definition --args '{"file_path":"src/main.rs","line":15,"character":20}'

# Find all references across the workspace
mcporter call --stdio mcpls --tool get_references --args '{"file_path":"src/handler.rs","line":30,"character":12}'

# Structured outline of a file (functions, types, imports)
mcporter call --stdio mcpls --tool get_document_symbols --args '{"file_path":"src/lib.rs"}'

# Search for a symbol by name across the entire workspace
mcporter call --stdio mcpls --tool workspace_symbol_search --args '{"query":"process_request"}'

# Context-aware completions at a position
mcporter call --stdio mcpls --tool get_completions --args '{"file_path":"src/app.ts","line":50,"character":4}'
```

### Diagnostics & Refactoring

```bash
# Real compiler errors and warnings (file MUST be saved to disk first)
mcporter call --stdio mcpls --tool get_diagnostics --args '{"file_path":"src/lib.rs"}'

# Quick fixes available at a position (after seeing diagnostics)
mcporter call --stdio mcpls --tool get_code_actions --args '{"file_path":"src/lib.rs","line":42,"character":8}'

# Workspace-wide rename (prefer over manual find-and-replace)
mcporter call --stdio mcpls --tool rename_symbol --args '{"file_path":"src/lib.rs","line":20,"character":5,"new_name":"new_function_name"}'

# Auto-format document
mcporter call --stdio mcpls --tool format_document --args '{"file_path":"src/lib.rs"}'
```

### Call Hierarchy

```bash
# Step 1: get call hierarchy items at a position
mcporter call --stdio mcpls --tool prepare_call_hierarchy --args '{"file_path":"src/lib.rs","line":25,"character":1}'
# Returns a call hierarchy item — pass it to:
#   get_incoming_calls  — who calls this function? (consumers)
#   get_outgoing_calls  — what does this function call? (dependencies)
```

### Server Monitoring

```bash
# Debug "no results" issues
mcporter call --stdio mcpls --tool get_server_logs --args '{}'
```

## ⚠️ Rust indexing caveat — read before using on Rust projects

**rust-analyzer needs 10-30 seconds to index after cold start.** During
indexing, `get_hover`, `get_definition`, and `get_references` return empty
results `[]` for Rust files. This is a known mcpls limitation (it doesn't
block on indexing — see bug-ops/mcpls#196).

**`get_document_symbols` works immediately** (file-level, no indexing needed).
**TypeScript/JavaScript works immediately** — tsserver doesn't need background
indexing.

### Workaround for Rust

1. Make a warmup call first — `get_document_symbols` or `get_hover` on a
   known symbol — to trigger the language server to start.
2. Wait 20-30 seconds.
3. Retry the actual `get_definition` / `get_references` call.
4. If still empty, check `get_server_logs` for `rust-analyzer` indexing status.

Subsequent calls are fast — indexing is one-time per mcpls session.

## Diagnostic-driven editing workflow

After editing a file:

1. **Save the file to disk** — diagnostics reflect disk state, not memory.
2. Call `get_diagnostics` on the changed file.
3. For each error, call `get_code_actions` for available fixes.
4. Apply fixes or edit manually.
5. Repeat until `get_diagnostics` returns `[]`.

## When you need more

- **mcpls README** (full feature list, config, architecture) →
  https://github.com/bug-ops/mcpls
- **mcpls troubleshooting guide** →
  https://github.com/bug-ops/mcpls/blob/main/docs/user-guide/troubleshooting.md
- **mcpls configuration reference** →
  https://github.com/bug-ops/mcpls/blob/main/docs/user-guide/configuration.md
- **Default config** (all pre-configured servers) → `~/.config/mcpls/mcpls.toml`
- **Custom server config** — add `[[lsp_servers]]` entries in
  `~/.config/mcpls/mcpls.toml` or a project-local `mcpls.toml`

## Anti-patterns

- ❌ Using absolute file paths → `"path outside workspace"`. Use relative paths.
- ❌ Using `--root` flag in mcporter → it's a mcporter flag, not passed to
  mcpls. `cd` to project instead.
- ❌ Calling `get_hover` / `get_definition` / `get_references` on Rust files
  immediately after cold start without warmup → empty results `[]`.
- ❌ Calling `get_diagnostics` before saving the file → stale results.
- ❌ Using `rename_symbol` without first checking `get_references` → may miss
  usages in macro expansions or generated code.
- ❌ Guessing types/signatures when `get_hover` is available → use the compiler.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `"path outside workspace"` | Use a relative path (from project root). `cd` to project first. |
| `"LSP server not available for file type"` | No server configured for that file extension. Install the language server (see Prerequisites). |
| Empty `[]` from Rust `get_definition` / `get_references` | rust-analyzer is still indexing. Wait 20-30s and retry. Check `get_server_logs`. |
| `get_diagnostics` returns stale errors | Save the file to disk first. Diagnostics reflect disk state. |
| `"server is still initializing"` | Language server is loading a large project. Wait and retry. Increase `timeout_seconds` in config for large workspaces. |
| `"Position out of bounds"` | Verify line is within file. Positions are 1-based — don't use 0-based LSP positions. |
| Slow first response, fast subsequent | Normal cold start / indexing. Pre-warm with a dummy `get_document_symbols` call. |
| `rename_symbol` misses some references | Symbol is in macro expansion or generated code. Always verify with `get_references` first. |
