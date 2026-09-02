---
name: mcpls
description: >
  Semantic code navigation via LSP through the mcpls MCP→LSP bridge.
  Find definitions, references, hover types, workspace symbols, diagnostics,
  call hierarchy, rename refactoring, and completions — all compiler-accurate,
  not text-level guesses. Use instead of grep/rg when you need to know WHERE
  a symbol is defined, WHAT type it is, WHO calls a function, or WHAT
  diagnostics exist — not just find text occurrences. Works with Rust,
  TypeScript, Python, Go, C/C++, Zig and more. Register via `mcp.$register`,
  call `mcp.mcpls.*` inside `fabric_exec`.
---

# mcpls (MCP→LSP bridge)

Give AI agents compiler-accurate code understanding through Language Server Protocol —
type inference, cross-references, semantic navigation, real diagnostics. Single
Rust binary, no Node.js/Python runtime needed.

## Prerequisites

```ts
// mcpls installed? (cargo install mcpls)
await pi.bash({ cmd: "mcpls --version" });
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

## Register with Fabric

mcpls is an ad-hoc stdio server — register it once per session, then call
`mcp.mcpls.*` directly:

```ts
// Register (cwd = project root so mcpls auto-detects workspace markers)
await mcp.$register({
  name: "mcpls",
  command: "mcpls",
  cwd: process.cwd(),
});

// Smoke test
await mcp.mcpls.get_server_logs({});
```

`$register` creates an ephemeral server in the pooled mcporter runtime. It
stays available for the rest of the session.

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

Three rules to get right:

1. **Register with `cwd` = project root** — mcpls auto-detects workspace
   markers from there.

2. **File paths must be relative** to project root. Absolute paths cause
   `"path outside workspace"` errors.

3. **Positions are 1-based** — line 1, character 1 = first character. Use line
   numbers from `pi.read` directly (mcpls translates to 0-based LSP internally).

Minimal example:

```ts
await mcp.mcpls.get_hover({ file_path: "src/main.rs", line: 10, character: 5 });
```

## Top tools

All calls are `mcp.mcpls.<tool>(args)` inside `fabric_exec`.

### Code Intelligence

```ts
// What type/signature is at this position?
await mcp.mcpls.get_hover({ file_path: "src/lib.rs", line: 42, character: 8 });

// Jump to definition
await mcp.mcpls.get_definition({ file_path: "src/main.rs", line: 15, character: 20 });

// Find all references across the workspace
await mcp.mcpls.get_references({ file_path: "src/handler.rs", line: 30, character: 12 });

// Structured outline of a file (functions, types, imports)
await mcp.mcpls.get_document_symbols({ file_path: "src/lib.rs" });

// Search for a symbol by name across the entire workspace
await mcp.mcpls.workspace_symbol_search({ query: "process_request" });

// Context-aware completions at a position
await mcp.mcpls.get_completions({ file_path: "src/app.ts", line: 50, character: 4 });
```

### Diagnostics & Refactoring

```ts
// Real compiler errors and warnings (file MUST be saved to disk first)
await mcp.mcpls.get_diagnostics({ file_path: "src/lib.rs" });

// Quick fixes available at a position (after seeing diagnostics)
await mcp.mcpls.get_code_actions({ file_path: "src/lib.rs", line: 42, character: 8 });

// Workspace-wide rename (prefer over manual find-and-replace)
await mcp.mcpls.rename_symbol({ file_path: "src/lib.rs", line: 20, character: 5, new_name: "new_function_name" });

// Auto-format document
await mcp.mcpls.format_document({ file_path: "src/lib.rs" });
```

### Call Hierarchy

```ts
// Step 1: get call hierarchy items at a position
const items = await mcp.mcpls.prepare_call_hierarchy({ file_path: "src/lib.rs", line: 25, character: 1 });
// Returns a call hierarchy item — pass it to:
//   get_incoming_calls  — who calls this function? (consumers)
//   get_outgoing_calls  — what does this function call? (dependencies)
```

### Server Monitoring

```ts
// Debug "no results" issues
await mcp.mcpls.get_server_logs({});
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
- ❌ Calling `get_hover` / `get_definition` / `get_references` on Rust files
  immediately after cold start without warmup → empty results `[]`.
- ❌ Calling `get_diagnostics` before saving the file → stale results.
- ❌ Using `rename_symbol` without first checking `get_references` → may miss
  usages in macro expansions or generated code.
- ❌ Guessing types/signatures when `get_hover` is available → use the compiler.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `"path outside workspace"` | Use a relative path (from project root). Register with correct `cwd`. |
| `"LSP server not available for file type"` | No server configured for that file extension. Install the language server (see Prerequisites). |
| Empty `[]` from Rust `get_definition` / `get_references` | rust-analyzer is still indexing. Wait 20-30s and retry. Check `get_server_logs`. |
| `get_diagnostics` returns stale errors | Save the file to disk first. Diagnostics reflect disk state. |
| `"server is still initializing"` | Language server is loading a large project. Wait and retry. Increase `timeout_seconds` in config for large workspaces. |
| `"Position out of bounds"` | Verify line is within file. Positions are 1-based — don't use 0-based LSP positions. |
| Slow first response, fast subsequent | Normal cold start / indexing. Pre-warm with a dummy `get_document_symbols` call. |
| `rename_symbol` misses some references | Symbol is in macro expansion or generated code. Always verify with `get_references` first. |
