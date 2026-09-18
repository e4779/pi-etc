---
name: mcporter
description: >
  MCP servers under fabric: config, discovery, and the mcporter CLI.
  Fabric's MCP runtime is mcporter-based — servers live in
  ~/.mcporter/mcporter.json and are called as mcp.<server>.<tool>() natives
  inside fabric_exec. Use the CLI only for debugging, ad-hoc servers, and
  config surgery. Overview skill — per-server details live in their own skills.
  RU: MCP-сервер не отвечает, неизвестный тул, конфиг mcporter, добавить сервер.
---

# mcporter (fabric's MCP runtime)

Under fabric you rarely invoke the `mcporter` CLI directly: fabric embeds the
mcporter runtime, discovers every server in `~/.mcporter/mcporter.json`, and
binds each tool as a **native** inside `fabric_exec`:

```ts
await mcp.zai_search.web_search_prime({ search_query: "..." });  // zai-search → zai_search
await tools.call({ ref: "mcp.$servers" });   // what's registered? (tool counts, staleness)
await tools.call({ ref: "mcp.$reload" });    // re-read config after editing it
await tools.call({ ref: "mcp.$call",          // explicit server+tool (computed names)
  args: { server: "zai-zread", tool: "read_file", args: { repo_name: "9fans/go", file_path: "README.md" } } });
await mcp.$register({ name: "mcpls", command: "mcpls", cwd: process.cwd() });  // ephemeral ad-hoc server
```

Rules of thumb:

- **Calling a tool** → native `mcp.<server>.<tool>(args)`; hyphens become
  underscores. Batch independent calls with `Promise.all`.
- **"What servers/tools exist?"** → `tools.list({ provider: "mcp" })` or
  `tools.search({ query: "..." })`; one schema → `tools.describe({ ref })`.
- **Config changed** → `tools.call({ ref: "mcp.$reload" })`.
- **One-off server for this session** → `mcp.$register({ name, command, cwd })`.
- **CLI in a shell** → debugging, daemon management, config import — see below.

## When to use the CLI

- Debug a server outside fabric (`mcporter list <server> --status`)
- Manage the keep-alive **daemon** (fabric doesn't use it; standalone CLI calls do)
- Import servers from other clients (`mcporter config import cursor --copy`)
- Run an ad-hoc server from a shell script

**Don't** use the CLI for calls fabric can make natively — the CLI adds process
spawn, shell quoting, and stringly-typed output for zero benefit.

## CLI reference

```bash
mcporter call <server>.<tool> key=value ...
mcporter call '<server>.<tool>(key: "value", num: 1)'     # function-call syntax
mcporter call <server>.<tool> --args '{"key":"value"}'    # JSON payload
mcporter list                       # configured servers
mcporter list <server> --brief      # tool names (exact!)
mcporter list <server> --schema     # full signatures
mcporter list <server> --status     # connectivity check
mcporter daemon status|start|stop|restart   # keep-alive daemon (CLI-only)
mcporter config list|add|remove|get        # config surgery
mcporter config import cursor --copy        # steal servers from other clients
```

Flags on `call`: `--timeout <ms>`, `--output json|text|markdown|raw`,
`--save-images <dir>`, `--raw-strings`, `--no-coerce`, `--tail-log`.

Ad-hoc without config:

```bash
mcporter call --stdio "npx -y @modelcontextprotocol/server-filesystem" --tool read_file path=/tmp/data.txt
mcporter call https://api.example.com/mcp.fetch url=https://example.com
```

(Inside fabric, prefer `mcp.$register` for the same effect — no quoting.)

## Config

`~/.mcporter/mcporter.json` → `{ "mcpServers": { <name>: { command+args | baseUrl+headers, env } } }`.
Priority: `./config/mcporter.json` (project) > `~/.mcporter/mcporter.json`.
After editing: `tools.call({ ref: "mcp.$reload" })` (fabric) or
`mcporter daemon restart` (CLI daemon).

Auth lives per-server: `env` (e.g. `GITHUB_PERSONAL_ACCESS_TOKEN`,
`Z_AI_API_KEY`) or `headers.Authorization` for HTTP servers.

## Per-server skills

| skill | servers | purpose |
|---|---|---|
| [chrome-devtools](../chrome-devtools/SKILL.md) | `chrome-devtools`, `chrome-devtools-proxy` | Drive a real Chrome tab (scrape, test, debug) |
| [github](../github/SKILL.md) | `github` | Search repos/code/issues, read files, manage PRs |
| [zai-mcp](../zai-mcp/SKILL.md) | `zai-search`, `zai-reader`, `zai-zread`, `zai-vision` | Web search, page-to-markdown, repo knowledge, image/video analysis |
| [mcpls](../mcpls/SKILL.md) | `mcpls` (ad-hoc stdio) | Semantic code navigation via LSP |
