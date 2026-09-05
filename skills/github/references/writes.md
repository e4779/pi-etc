# GitHub MCP — Write Operations

> **Patterns for mutating GitHub state.** All operations require auth via
> `GITHUB_PERSONAL_ACCESS_TOKEN` in the server's `env` block. All calls are
> fabric natives: `await mcp.github.<tool>({ ... })` inside `fabric_exec`.

---

## Create an issue

```ts
await mcp.github.issue_write({
  method: "create",
  owner: "owner", repo: "myrepo",
  title: "Bug: authentication fails after timeout",
  body: "### Steps to reproduce\n\n1. Login\n2. Wait 30 minutes\n3. Try /api/profile\n\n### Actual\n401 Unauthorized.",
  labels: ["bug", "high-priority"],
  assignees: ["developer-username"],
});
```

**Params:** `method: "create"`, `owner`, `repo` (required); `title`, `body`,
`labels`, `assignees`, `milestone`, `type` (optional).

## Update an issue / close it

```ts
await mcp.github.issue_write({
  method: "update",
  owner: "owner", repo: "myrepo", issue_number: 42,
  state: "closed", state_reason: "completed",
});
```

`issue_number` selects the target; `state: "open" \| "closed"`.

## Comment on an issue

```ts
await mcp.github.add_issue_comment({
  owner: "owner", repo: "myrepo", issue_number: 42,
  body: "I can reproduce this. Here's the error log:\n\n```\nError: timeout at line 123\n```",
});
```

**Params:** `owner`, `repo`, `issue_number`, `body` (all required).
Optional: `comment_id` (reply), `reaction`.

## Create a branch

```ts
await mcp.github.create_branch({
  owner: "owner", repo: "myrepo", branch: "feature-new-endpoint",
});
```

## Create a file (new file)

```ts
await mcp.github.create_or_update_file({
  owner: "owner", repo: "myrepo", path: "docs/api.md",
  content: "# API Documentation\n\n...",
  message: "docs: add API documentation",
  branch: "main",
});
```

**No `sha` needed** for new files.

## Update a file (existing) — the `sha` gotcha

**The pattern:** read the file first to extract its SHA, then write with that
SHA. GitHub requires it to detect conflicts and prevent accidental overwrites.

```ts
// Step 1: get the file to extract the SHA
const cur = await mcp.github.get_file_contents({
  owner: "owner", repo: "myrepo", path: "README.md" });
const sha = (cur.structuredContent ?? cur)?.sha;

// Step 2: update with the SHA
await mcp.github.create_or_update_file({
  owner: "owner", repo: "myrepo", path: "README.md",
  content: "# My Project\nUpdated content...",
  message: "docs: update README",
  branch: "main",
  sha,
});
```

**Without `sha`** the call fails with "SHA of the file being replaced is
required when updating existing files."

## Batch push multiple files

```ts
await mcp.github.push_files({
  owner: "owner", repo: "myrepo", branch: "main",
  files: [
    { path: "README.md",    content: "# My Project\n..." },
    { path: "src/main.ts",  content: 'console.log("hello");' },
    { path: ".gitignore",   content: "node_modules/\n" },
  ],
  message: "feat: initial commit",
});
```

**Params:** `owner`, `repo`, `branch`, `files` (`[{path, content}]`),
`message` (all required). One commit for all files — no `sha` needed.

## Create a pull request

```ts
await mcp.github.create_pull_request({
  owner: "owner", repo: "myrepo",
  title: "Add user authentication",
  head: "feature-auth", base: "main",
  body: "Implements login/logout with JWT tokens.",
  draft: true,                    // optional
  reviewers: ["reviewer-login"],  // optional
});
```

**Params:** `owner`, `repo`, `title`, `head`, `base` (required); `body`,
`draft`, `maintainer_can_modify`, `reviewers` (optional).

## Review a pull request

```ts
// Approve
await mcp.github.pull_request_review_write({
  method: "approve",  // pick per intent: approve / request_changes / comment
  owner: "owner", repo: "myrepo", pullNumber: 42,
  body: "LGTM, ready to merge.",
});
```

**Params:** `method`, `owner`, `repo`, `pullNumber` (required); `body`,
`commitID`, `threadId` (optional). Check the exact `method` enum with
`tools.describe({ ref: "mcp.github.pull_request_review_write" })` before
first use — the server may name modes differently.

## Merge a pull request

```ts
await mcp.github.merge_pull_request({
  owner: "owner", repo: "myrepo", pullNumber: 42,
  merge_method: "squash",   // "merge" | "squash" | "rebase"
  commit_title: "feat: add user authentication",
  commit_message: "Implements login/logout with JWT tokens. Fixes #123.",
});
```

**Params:** `owner`, `repo`, `pullNumber` (required); `commit_title`,
`commit_message`, `merge_method`, `expectedHeadSha` (optional — set it to
avoid racing a force-push).

## Fork a repository

```ts
await mcp.github.fork_repository({ owner: "earendil-works", repo: "pi" });
```

## Common gotchas

| Gotcha | Solution |
|---|---|
| Updating a file fails without `sha` | Get `sha` from `get_file_contents` first (see above) |
| PR merge fails with "not mergeable" | Check CI: `pull_request_read({ method: "get_status", ... })`; resolve conflicts |
| Branch creation fails "already exists" | Use a different name or delete via git CLI |
| Auth errors on write ops | Token needs `repo` scope (`public_repo` for public only) |
| Old param names rejected | `q`→`query`, `pull_number`→`pullNumber` (see `../SKILL.md` rename map) |

---

## See also

- `../SKILL.md` — top tools, rename map, search/read workflows
- `tools.md` — all 44 tools with full signatures
