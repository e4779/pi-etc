---
name: github
description: >
  GitHub via the github MCP server: search repos/code/issues, read files,
  list issues & PRs, create issues/PRs/comments, review and merge PRs.
  Use when the user asks to search GitHub, read a repo file without
  cloning, check issues/PRs, or file an issue/PR. Call native `mcp.github.*`
  inside fabric_exec — the 44-tool schema stays out of context.
  RU: поищи на GitHub, открой файл/репозиторий без клонирования, создай issue или PR, проверь PR.
---

# GitHub MCP (github)

Drive GitHub through **fabric natives** — `mcp.github.<tool>()` inside
`fabric_exec`. Fabric discovers the server from `~/.mcporter/mcporter.json`
and binds every tool type-checked; results come back as values
(`{ text, content, structuredContent }` — prefer `.structuredContent`).

The server surface **changed across versions** (44 tools now; method-style
multi-tools). If a name you remember 404s, check the rename map below or
`tools.list({ provider: "mcp" })`.

## Prerequisites

- `github` server in `~/.mcporter/mcporter.json` (STDIO,
  `GITHUB_PERSONAL_ACCESS_TOKEN` in its `env`).
- Stateless — first native call connects.

Smoke test:
```ts
const me = await mcp.github.get_me({});   // who am I? → auth works
```

## When to use

- "Search GitHub for …", "find repos about …", "look up issues in …" → search_*
- "Read this file from GitHub", "show me a repo's README" → `get_file_contents`
- "List open issues/PRs", "check PR status", "get a PR diff" → `list_issues` / `pull_request_read`
- "File an issue", "create a PR", "review a PR", "merge a PR" → write tools (`writes.md`)

**Don't** use it for local git work — use `git` CLI. GitHub MCP is for remote
read/search and lightweight writes. For heavy local work (edit, commit, push),
clone.

## Top tools

| tool | purpose |
|---|---|
| `search_repositories` | find repos (`query: "stars:>1000 language:rust"`) |
| `search_code` | search code across GitHub (`query`, not `q`) |
| `search_issues` / `search_pull_requests` | search issues/PRs |
| `get_file_contents` | read a file from a repo (no clone) |
| `list_issues` | list issues (state, labels, direction, orderBy) |
| `issue_read` | one issue (+comments) — `method: "get"` |
| `list_pull_requests` | list PRs |
| `pull_request_read` | PR diff/status/files/reviews — one tool, `method` picks the view |
| `issue_write` | create/update an issue — `method: "create" \| "update"` |

## Recipes

```ts
// Search repos by topic/language
const hits = await mcp.github.search_repositories({
  query: "stars:>1000 language:rust", perPage: 3 });

// Read a file from a repo (no clone)
const readme = await mcp.github.get_file_contents({
  owner: "earendil-works", repo: "pi", path: "README.md" });

// List open issues
const issues = await mcp.github.list_issues({
  owner: "earendil-works", repo: "pi", state: "open" });

// Get a PR diff
const diff = await mcp.github.pull_request_read({
  method: "get_diff", owner: "oreilly-japan", repo: "rust-book", pullNumber: 1 });

// File an issue
await mcp.github.issue_write({
  method: "create", owner: "e4779", repo: "myrepo",
  title: "Bug: ...", body: "..." });

// Batch independent reads — one round trip of your attention
const [r1, r2] = await Promise.all([
  mcp.github.get_file_contents({ owner: "o", repo: "r", path: "package.json" }),
  mcp.github.list_pull_requests({ owner: "o", repo: "r", state: "open" }),
]);
```

## ⚠️ Rename map (2025 server → current)

| old name you might remember | current |
|---|---|
| `create_issue` | `issue_write` with `method: "create"` |
| `update_issue` | `issue_write` with `method: "update"` + `issue_number` |
| `get_issue` / `get_issue_comments` | `issue_read` (`method: "get"`) |
| `get_pull_request` | `pull_request_read` with `method: "get"` |
| `get_pull_request_files` | `pull_request_read` with `method: "get_files"` |
| `get_pull_request_diff` | `pull_request_read` with `method: "get_diff"` |
| `get_pull_request_status` | `pull_request_read` with `method: "get_status"` |
| `get_pull_request_reviews` / `_comments` / `_commits` | `pull_request_read` (`get_reviews` / `get_comments` / `get_commits`) |
| `create_pull_request_review` | `pull_request_review_write` |
| search param `q` | `query` |
| `pull_number` | `pullNumber` |
| `search_issues_and_pull_requests` | `search_issues` / `search_pull_requests` |

`pull_request_read.method`: `get \| get_diff \| get_status \| get_files \| get_commits
\| get_review_comments \| get_reviews \| get_comments \| get_check_runs`.

## When you need more

- **All 44 tools + full signatures** (generated from the live catalog) → `pi.read skills/github/references/tools.md`
- **Write operations** (sha gotcha, batch push, reviews, merge) → `pi.read skills/github/references/writes.md`

Load these only when the task needs them — that's the whole point.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `401` / auth error | `GITHUB_PERSONAL_ACCESS_TOKEN` missing/wrong in the server's `env` block of `~/.mcporter/mcporter.json` |
| `Unknown Fabric action` / tool not found | name drifted → rename map above, or `tools.list({ provider: "mcp" })` |
| param rejected (`q`, `pull_number`) | renamed → `query`, `pullNumber` (see rename map) |
| `create_or_update_file` fails on update | missing `sha` → get it from `get_file_contents` first (see `writes.md`) |
| 400 on a call | check the exact schema: `tools.describe({ ref: "mcp.github.<tool>" })` |

`mcporter call github.* …` in a shell remains a break-glass fallback, but under
fabric prefer natives: no spawn, no quoting, values not strings.
