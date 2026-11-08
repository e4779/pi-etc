---
name: mcpls
description: >
  Semantic code navigation via LSP through the mcpls MCP→LSP bridge:
  definitions, references, hover types, workspace symbols, compiler
  diagnostics, call hierarchy, completions, workspace-wide rename —
  compiler-accurate, not text-level guesses. Use instead of grep/rg when
  you need WHERE a symbol is defined, WHAT type it is, WHO calls or uses a
  function, or WHAT diagnostics exist, in Rust, TypeScript, Python, Go,
  C/C++, Zig projects. Don't use for plain text search (use rg) or
  structural pattern replace (use ast-grep). Call via `mcp.mcpls.*` in
  fabric_exec or `mcporter call mcpls.<tool>` in the shell contour.
  RU: где определена функция, найди определение, кто вызывает, кто
  использует, найди референсы, тип символа, диагностика, безопасный rename,
  пустой результат rust-analyzer. Errors: path outside workspace,
  LSP server not available.
---

# mcpls (MCP→LSP bridge)

Compiler-accurate code understanding via the Language Server Protocol — type
inference, cross-references, semantic navigation, diagnostics.
Two call contours: Fabric and shell.

## When to use

| Use mcpls | Use instead |
|---|---|
| Find WHERE a symbol is defined | Text occurrences of a string → `rg` |
| List all symbols/functions in a file | Regex pattern search → `rg` |
| Find all references to a symbol | Count matches across files → `rg` |
| Get type info (hover) | Comments or string literals → `rg` |
| Get compiler diagnostics | Simple text search → `rg` |
| Rename a symbol workspace-wide | Structural pattern replace → `ast-grep` |
| Trace call hierarchy (who calls what) | — |

**Don't** use mcpls for plain text search or AST-pattern rewrites — `rg` is
faster for text, `ast-grep` for structural replace.

## Prerequisites

At least one language server **on PATH**; mcpls picks which from project
markers (Cargo.toml, package.json, pyproject.toml, go.mod, ...):

| Language | Server | Install |
|---|---|---|
| Rust | rust-analyzer | `rustup component add rust-analyzer` |
| TS/JS | typescript-language-server + typescript | `npm i -g typescript-language-server typescript` |
| Python | pyright | `npm i -g pyright` |
| Go | gopls | `go install golang.org/x/tools/gopls@latest` |
| C/C++ | clangd | system package manager |
| Zig | zls | `zig build -Doptimize=ReleaseSafe` from zls source |

TS/JS cross-file resolution (definitions/references beyond one file) requires
`tsconfig.json` at the project root (`jsconfig.json` for plain JS).

## Installation

From crates.io (requires rustc >= 1.99):

```bash
cargo install mcpls --locked
```

HTTP transport (needed for the `~/bin/mcpls-ensure` fallback):

```bash
cargo install mcpls --locked --features transport-http
```

Pre-built binaries: [GitHub Releases](https://github.com/bug-ops/mcpls/releases) —
verify the `.sha256` sidecar; commands in [references/install.md](references/install.md).

Verify: `mcpls --version`.

## Configuration

Resolution order, trust model, and all fields:
[references/configuration.md](references/configuration.md).

Key rule: a project-local `mcpls.toml` is ignored unless trusted; enabling
`--trust-project-config` on an untrusted checkout is arbitrary code execution
(it can set the `command`/`args` of spawned servers).

## How to call — two contours

### Fabric: `mcp.mcpls.*` inside `fabric_exec`

Register once per session (cwd = project root), then call tools:

```ts
await mcp.$register({
  name: "mcpls",
  command: "mcpls",
  cwd: process.cwd(),
});
await mcp.mcpls.get_server_logs({}); // smoke test
```

### Shell: `mcporter call`

```bash
mcporter call mcpls.get_hover file_path=src/lib.rs line=42 character=8
```

- The mcporter daemon pools the stdio server via `lifecycle: keep-alive`:
  spawn on first call, idle retire after 10 min.
- **Cold start:** the first call after spawn/idle may return empty results
  while the project loads — **retry once**; later calls are warm.
- Keep-alive needs a local patch (openclaw/mcporter#499); on `retirement is unverified` use the fallbacks below.

Fallbacks if the pooled path is unavailable:

```bash
# One-shot stdio session (spawn + retry handled internally)
~/bin/mcpls-call get_references file_path=src/handler.rs line=30 character=12

# Or start the HTTP daemon explicitly, then call via its baseUrl
~/bin/mcpls-ensure && mcporter call mcpls.get_diagnostics file_path=src/lib.rs
```

## Core workflow

Three rules:

1. **Register / launch with cwd = project root** — mcpls auto-detects workspace
   markers from there.
2. **File paths must be relative** to project root. Absolute paths cause
   `"path outside workspace"`; if a relative path still fails, check
   `[workspace] roots` in `mcpls.toml` — the file must sit under a root.
3. **Positions are 1-based** — line 1, character 1 = first character. Line
   numbers from reads work as-is (mcpls translates to 0-based LSP internally).

```ts
await mcp.mcpls.get_hover({ file_path: "src/main.rs", line: 10, character: 5 });
```

- `rename_symbol` returns workspace text edits — it does **not** apply them.
- `get_diagnostics` reflects disk state — save the file first.
- TS/JS cross-file navigation needs `tsconfig.json` (`jsconfig.json` for JS).

## Top tools

Fabric syntax shown; shell: `mcporter call mcpls.<tool> key=value ...`.

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
// Search for a symbol by name across the workspace
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
// Workspace-wide rename (prefer over manual find-and-replace).
// Returns text edits — does NOT apply them.
await mcp.mcpls.rename_symbol({ file_path: "src/lib.rs", line: 20, character: 5, new_name: "new_function_name" });
// Auto-format document
await mcp.mcpls.format_document({ file_path: "src/lib.rs" });
```

### Call Hierarchy

```ts
// Step 1: get call hierarchy items at a position
const items = await mcp.mcpls.prepare_call_hierarchy({ file_path: "src/lib.rs", line: 25, character: 1 });
// Then: get_incoming_calls — who calls it? get_outgoing_calls — what does it call?
```

### Server Monitoring

```ts
// Debug "no results" issues
await mcp.mcpls.get_server_logs({});
```

## Rust: rust-analyzer indexing delay (empty results after cold start)

**rust-analyzer needs 10-30 seconds to index after cold start.** During
indexing, `get_hover`, `get_definition`, and `get_references` return empty
results `[]` for Rust files (mcpls doesn't block on indexing —
bug-ops/mcpls#196).

**`get_document_symbols` works immediately** (file-level, no indexing needed).
**TypeScript/JavaScript works immediately** — tsserver needs no background
indexing.

### Workaround for Rust

1. Warmup call first — `get_document_symbols` or `get_hover` on a known
   symbol — to trigger the language server to start.
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

## Anti-patterns

- ❌ Using `rename_symbol` without first checking `get_references` → may miss
  usages in macro expansions or generated code.
- ❌ Guessing types/signatures when `get_hover` is available → use the compiler.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Empty `[]` on the first call after spawn/idle (any language) | Project still loading. Retry once; calls are warm afterwards. |
| `"path outside workspace"` | Use a relative path from project root; verify `[workspace] roots` in `mcpls.toml` covers the file. |
| `"LSP server not available for file type"` | No server configured for that extension. Install one (see Prerequisites). |
| Empty `[]` from Rust `get_definition` / `get_references` | rust-analyzer still indexing. Wait 20-30s, retry. Check `get_server_logs`. |
| `get_diagnostics` returns stale errors | Save the file to disk first. Diagnostics reflect disk state. |
| `"server is still initializing"` | Large project loading. Wait and retry; raise `timeout_seconds` in config. |
| `"Position out of bounds"` | Verify the line exists. Positions are 1-based — not 0-based LSP. |
| Rust: symbols/diagnostics fine, hover/definition/references empty | `workspace.roots` has only umbrella directories — none is a cargo root, so rust-analyzer treats files as detached. Add the project root (dir with `Cargo.toml`) to `roots` and restart. TS tolerates umbrellas (tsserver finds nested tsconfig); Rust does not. |
| Slow first response, fast subsequent | Normal cold start / indexing. Pre-warm with a dummy `get_document_symbols`. |
| rename/references cover one file only; definition from a usage lands on the import line | Cold project graph: answers are valid but **local-only** and look correct. Warm the project (any call + a few seconds; a `get_references` before `rename_symbol`), then retry. A large project sharing the pooled session delays warming of others. |
| Applying rename/format edits by hand | Result positions are 1-based (mcpls normalizes). Use `~/bin/mcpls-apply` — accepts `{changes}`, a bare changes array, or `{edits}`. |
| `rename_symbol` misses some references | Symbol is in macro expansion or generated code. Verify with `get_references` first. |
| mcporter: `"retirement is unverified"` | Keep-alive patch (openclaw/mcporter#499) missing. Use the `~/bin/mcpls-call` wrapper. |
| Call hierarchy / code actions return an error or `isError` on TS | typescript-language-server does not support them. Check `get_tool_support` before relying on a capability for a given language. |
| Completions return `[]` | Cursor position must be inside the document (line beyond end → empty). |

## When you need more

- mcpls book (full docs) → https://bug-ops.github.io/mcpls/
- README / architecture → https://github.com/bug-ops/mcpls
- Troubleshooting guide → https://bug-ops.github.io/mcpls/guide/troubleshooting.html
- `get_tool_support` — which tools the active server supports (check before
  relying on call hierarchy or rename for a given language).
