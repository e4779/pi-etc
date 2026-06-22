---
name: github
description: >
  GitHub via the github MCP server: search repos/code/issues, read files,
  list issues & PRs, create issues/PRs/comments, review and merge PRs.
  Use when the user asks to search GitHub, read a repo file without
  cloning, check issues/PRs, or file an issue/PR. Wraps
  `mcporter call github.*` so the 26-tool schema stays out of context.
allowed-tools: bash read
---

# GitHub MCP (github)

Drive GitHub through the `github` MCP via `mcporter call`. The top tools cover
search, file reading, and issue tracking; write operations and the full surface
load on demand from `references/`.

## Prerequisites

- **`mcporter` CLI** on PATH; `github` server configured in
  `~/.mcporter/mcporter.json` (STDIO, needs `GITHUB_PERSONAL_ACCESS_TOKEN` in
  the server `env`).
- **No daemon** — stateless STDIO server that connects on-demand per call.

Verify it's reachable:
```bash
mcporter list github --brief   # → 26 tools
mcporter call github.search_repositories query="stars:>1000 language:rust" perPage=3
```

## When to use

- "Search GitHub for …", "find repos about …", "look up issues in …" → `github`
- "Read this file from GitHub", "show me a repo's README" → `get_file_contents`
- "List open issues/PRs", "check PR status", "get a PR diff" → issue/PR tools
- "File an issue", "create a PR", "review a PR", "merge a PR" → write tools

**Don't** use it for local git work — use `git` CLI. GitHub MCP is for remote
read/search and lightweight writes. For heavy local work (edit, commit, push),
clone.

## Top tools (all calls: `mcporter call github.<tool> key=value ...`)

| tool | purpose |
|---|---|
| `search_repositories` | find repos by query (`stars:>1000 language:rust`) |
| `search_code` | search code across GitHub (`filename:package.json express`) |
| `search_issues` | search issues/PRs (`is:open label:bug repo:owner/name`) |
| `get_file_contents` | read a file from a repo (no clone) |
| `list_issues` | list issues in a repo (filter by state, labels) |
| `list_pull_requests` | list PRs in a repo (filter by state, branch) |
| `get_pull_request_files` | get a PR diff (changed files) |
| `create_issue` | file a new issue |

## Recipes

```bash
# Search repos by topic/language
mcporter call github.search_repositories query="stars:>1000 language:rust" perPage=3

# Read a file from a repo (no clone)
mcporter call github.get_file_contents owner=earendil-works repo=pi path=README.md

# List open issues in a repo
mcporter call github.list_issues owner=earendil-works repo=pi state=open

# Get a PR diff
mcporter call github.get_pull_request_files owner=oreilly-japan repo=rust-book pull_number=1

# File an issue
mcporter call github.create_issue owner=owner repo=myrepo title="Bug: ..." body="..."
```

## Output is JSON

Pipe to `jq`/`toonq` for filtering:

```bash
# Extract issue numbers+titles from list_issues output
mcporter call github.list_issues owner=earendil-works repo=pi state=open | \
  jq -r '.[] | "#\(.number): \(.title)"'
```

## When you need more

- **All 26 tools + full signatures** → `read skills/github/references/tools.md`
- **Write operations** → `read skills/github/references/writes.md`

Load these only when the task needs them — that's the whole point.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `401` / auth error | `GITHUB_PERSONAL_ACCESS_TOKEN` missing/wrong in the server's `env` block of `~/.mcporter/mcporter.json` |
| `Tool X not found` / "not a known tool" | name is wrong → `mcporter list github --brief` for the exact name |
| `create_or_update_file` fails on update | missing `sha` param → get it from `get_file_contents` first (see `writes.md`) |

No daemon to restart — stateless STDIO server.