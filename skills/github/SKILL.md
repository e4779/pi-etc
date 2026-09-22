---
name: github
description: >
  GitHub operations via the github MCP server: search repos/code/issues/PRs,
  read files without cloning, list and write issues/PRs, releases, commits,
  branches, Actions/CI runs and logs. Use for ANY github.com touchpoint: a
  repo URL in the message, "check CI runs", "latest release of X", "who
  maintains Y", "what changed in Z", "who uses pattern P across GitHub" —
  before falling back to anything else. Missing mcp.github.* entries in
  tools.list do NOT mean missing tools (the list silently truncates) — call
  natives anyway; CI/Actions = actions_list / actions_get /
  actions_run_trigger / get_job_logs. Never gh CLI (not installed) and never
  raw curl against api.github.com. Not for local git work — use git CLI. RU:
  поищи на гитхабе, открой файл/репозиторий без клонирования, проверь релизы
  или CI, найди issue или PR, создай issue/PR.
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

## Actions / CI runs — native since 2026-09-19 (`--toolsets=default,actions`)

Method-style tools, like `issue_read`:

| tool | purpose |
|---|---|
| `actions_list` | methods: list_workflows, list_workflow_runs, list_workflow_jobs, list_workflow_run_artifacts |
| `actions_get` | methods: get_workflow, get_workflow_run, get_workflow_job, download_workflow_run_artifact, get_workflow_run_usage, get_workflow_run_logs_url |
| `actions_run_trigger` | methods: run_workflow, rerun_workflow_run, rerun_failed_jobs, cancel_workflow_run, delete_workflow_run_logs |
| `get_job_logs` | job logs — `job_id` for one job; `run_id` + `failed_only: true` for all failed; `return_content: true` to inline text. ids are NUMBERS — a string `run_id`/`resource_id` fails validation ("must be number") |

```ts
const runs: any = await mcp.github.actions_list({
  method: "list_workflow_runs", owner: "earendil-works", repo: "pi", perPage: 5 });
const jobs: any = await mcp.github.actions_list({
  method: "list_workflow_jobs", owner: "earendil-works", repo: "pi",
  resource_id: runs.workflow_runs[0].id });
const logs: any = await mcp.github.get_job_logs({
  owner: "earendil-works", repo: "pi", run_id: runs.workflow_runs[0].id,
  failed_only: true, return_content: true });
```

After editing the server `args` in `~/.mcporter/mcporter.json` — run
`tools.call({ ref: "mcp.$reload" })`, otherwise the old tool catalog stays
bound.

Break-glass only (server down / toolset disabled again): anonymous REST via
proxy — `GET https://api.github.com/repos/<o>/<r>/actions/runs` with headers
`User-Agent` + `Accept: application/vnd.github+json`, Bun
`fetch(url, { proxy: 'http://127.0.0.1:8888' })`; 60 req/h per IP. A
GitHub-JSON 404 (body has `documentation_url`) means "not on github.com",
not bot-blocking.

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
