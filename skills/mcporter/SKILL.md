---
name: mcporter
description: >
  Use the mcporter CLI to discover, call, and manage MCP servers and tools
  from the terminal. Use when you need to list configured servers, discover
  available tools and their signatures, call an MCP tool, run an ad-hoc stdio
  or HTTP server, manage the keep-alive daemon, or edit server config.
  Overview skill — per-server details live in their own skills.
allowed-tools: bash read
---

# mcporter

Call MCP servers and tools directly from the terminal. Auto-discovers servers
configured by other MCP clients (Claude Desktop, Cursor, Codex, etc.).

## Prerequisites

```bash
mcporter --version                 # installed?
mcporter list                      # any servers configured?
```

Missing? `npm install -g mcporter` (requires Node.js).

## When to use

- Discover what MCP servers and tools are available
- Call an MCP tool from bash without loading the full JSON schema into context
- Run an ad-hoc MCP server (stdio or HTTP) without writing config
- Manage the keep-alive daemon (start/stop/status/restart)
- Inspect or edit server configuration

**Don't** use mcporter for local files — `read` them. Don't use it for
interactive browser flows — use `chrome-devtools` for that.

## Core call syntax

```bash
mcporter call <server>.<tool> key=value ...
mcporter call <server>.<tool> key:value ...              # colon also works
mcporter call '<server>.<tool>(key: "value", num: 1)'     # function-call syntax
mcporter call <server>.<tool> --args '{"key":"value"}'    # JSON payload
```

Flags:

| flag | purpose |
|---|---|
| `--timeout <ms>` | Override call timeout |
| `--output json\|text\|markdown\|raw` | Control output format (default: text) |
| `--save-images <dir>` | Save image content blocks to disk |
| `--raw-strings` | Keep numeric-looking values as strings |
| `--no-coerce` | Keep all arguments as raw strings |
| `--tail-log` | Stream returned log handles |

```bash
# Examples
mcporter call github.search_repositories query="stars:>1000 language:rust" perPage=3
mcporter call zai-search.web_search_prime search_query="rust async runtime" content_size=high
mcporter call chrome-devtools.navigate_page type=url url=https://example.com
mcporter call github.create_issue --args '{"owner":"e","repo":"r","title":"Bug","body":"..."}'

# Machine-readable output (for scripts / jq parsing)
mcporter call github.list_issues owner=e repo=r state=open --output json | jq '.[].title'
```

## Discovery: list servers and tools

```bash
# All configured servers
mcporter list

# Tool names for one server (compact)
mcporter list <server> --brief

# Full tool signatures with parameter types
mcporter list <server> --schema

# Check server connectivity without listing tools
mcporter list <server> --status

# JSON output for scripts
mcporter list <server> --brief --json
```

**Always verify tool names with `--brief` before calling** — names are exact,
not inferable. The #1 agent error is inventing tool names that don't exist.

## Ad-hoc servers (no config needed)

Run a server on the fly without editing config files:

```bash
# Stdio server (best for project-local tools like mcpls)
mcporter call --stdio "npx -y @modelcontextprotocol/server-filesystem" --tool read_file path=/tmp/data.txt
mcporter call --stdio mcpls --tool get_hover --args '{"file_path":"src/main.rs","line":10,"character":1}'
mcporter call --stdio "node ./server.mjs" --tool my_tool key=value
mcporter list --stdio "bun run ./server.ts" --name my-server --schema

# Append args to the stdio command
mcporter call --stdio mcpls --stdio-arg "--config" --stdio-arg "./mcpls.toml" --tool get_hover --args '{}'

# HTTP server (best for remote APIs)
mcporter call https://api.example.com/mcp.fetch url=https://example.com
mcporter list --http-url https://some-mcp-server.com --name my-server --schema

# Persist a useful ad-hoc server to config
mcporter call --stdio "node ./server.mjs" --tool my_tool key=value --persist ./config/mcporter.json
```

## Daemon

For servers marked as keep-alive (like chrome-devtools), the daemon keeps them
running between calls — no cold start per invocation.

```bash
mcporter daemon status      # running?
mcporter daemon start       # launch
mcporter daemon stop        # shut down
mcporter daemon restart     # fresh start (most common fix for flaky servers)
```

Common pattern: `mcporter daemon restart && sleep 3` — the go-to fix when a
keep-alive server goes stale (Chrome tab crashes, connection drops).

## Config

```bash
mcporter config list                    # all configured servers
mcporter config get <name> --json       # inspect one server's definition
mcporter config add <name> <url>        # persist an HTTP server
mcporter config remove <name>           # delete a local entry
mcporter config import cursor --copy    # copy servers from another client
```

Config auto-loads from:
- `./config/mcporter.json` (project-local, takes priority)
- `~/.mcporter/mcporter.json` (user-level)
- Editor imports (Cursor, Claude, Codex, etc.)

Override with `--config <path>`.

## Output control

| flag | when to use |
|---|---|
| `--output text` | Default. Human-readable. |
| `--output json` | Scripting, piping to `jq`/`toonq`. |
| `--output markdown` | Content returned as markdown (reader/summarizer tools). |
| `--output raw` | Compact, no formatting. |

## Per-server skills

These skills build on mcporter — each focuses on one MCP server's tools,
workflows, and anti-patterns:

| skill | server | purpose |
|---|---|---|
| [chrome-devtools](../chrome-devtools/SKILL.md) | `chrome-devtools` | Drive a real Chrome tab (scrape, test, debug) |
| [github](../github/SKILL.md) | `github` | Search repos/code/issues, read files, manage PRs |
| [zai-mcp](../zai-mcp/SKILL.md) | `zai-search`, `zai-reader`, `zai-zread`, `zai-vision` | Web search, page-to-markdown, repo knowledge, image/video analysis |
| [mcpls](../mcpls/SKILL.md) | `mcpls` (ad-hoc stdio) | Semantic code navigation via LSP |
