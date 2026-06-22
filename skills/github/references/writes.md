# GitHub MCP — Write Operations

> **Patterns for mutating GitHub state.** All operations require auth via
> `GITHUB_PERSONAL_ACCESS_TOKEN` in the server's `env` block.

All calls: `mcporter call github.<tool> key=value ...`

---

## Create an issue

```bash
mcporter call github.create_issue owner=owner repo=myrepo \
  title="Bug: authentication fails after timeout" \
  body="### Steps to reproduce\n\n1. Login\n2. Wait 30 minutes\n3. Try to access /api/profile\n\n### Expected\nSession remains valid.\n\n### Actual\n401 Unauthorized." \
  labels='["bug","high-priority"]' \
  assignees='["developer-username"]'
```

**Params:** `owner`, `repo`, `title` (required); `body`, `assignees`, `labels`,
`milestone` (optional).

---

## Comment on an issue

```bash
mcporter call github.add_issue_comment owner=owner repo=myrepo issue_number=42 \
  body="I can reproduce this. Here's the error log:\n\n```\nError: timeout at line 123\n```"
```

**Params:** `owner`, `repo`, `issue_number`, `body` (all required).

---

## Create a branch

```bash
mcporter call github.create_branch owner=owner repo=myrepo \
  branch=feature-new-endpoint

mcporter call github.create_branch owner=owner repo=myrepo \
  branch=feature-new-endpoint from_branch=dev  # from specific branch
```

**Params:** `owner`, `repo`, `branch` (required); `from_branch` (optional,
defaults to repo default branch).

---

## Create a file (new file)

```bash
mcporter call github.create_or_update_file \
  owner=owner repo=myrepo path=docs/api.md \
  content="# API Documentation\n\n..." \
  message="docs: add API documentation" \
  branch=main
```

**No `sha` needed** for new files. The file is created at the given path.

---

## Update a file (existing file) — the `sha` gotcha

**The pattern:** get the file first to extract its SHA, then update with that
SHA. GitHub requires the SHA to detect conflicts and prevent accidental
overwrites.

```bash
# Step 1: get the file to extract the SHA
SHA=$(mcporter call github.get_file_contents owner=owner repo=myrepo path=README.md | \
  jq -r '.sha')

# Step 2: update with the SHA
mcporter call github.create_or_update_file \
  owner=owner repo=myrepo path=README.md \
  content="# My Project\nUpdated content..." \
  message="docs: update README" \
  branch=main \
  sha="$SHA"
```

**Without the `sha` param**, the call fails with "SHA of the file being
replaced is required when updating existing files."

---

## Batch push multiple files

```bash
mcporter call github.push_files owner=owner repo=myrepo branch=main \
  --args '{
    "files": [
      {"path": "README.md", "content": "# My Project\n..."},
      {"path": "src/main.ts", "content": "console.log(\"hello\");"},
      {"path": ".gitignore", "content": "node_modules/\n"}
    ],
    "message": "feat: initial commit"
  }'
```

**Params:** `owner`, `repo`, `branch`, `files` (array of `{path, content}`),
`message` (all required).

---

## Create a pull request

```bash
# Simple PR
mcporter call github.create_pull_request \
  owner=owner repo=myrepo \
  title="Add user authentication" \
  head=feature-auth \
  base=main \
  body="Implements login/logout with JWT tokens."

# Draft PR
mcporter call github.create_pull_request \
  owner=owner repo=myrepo \
  title="WIP: new dashboard" \
  head=feature-dashboard \
  base=main \
  draft=true

# Allow maintainer to edit
mcporter call github.create_pull_request \
  owner=owner repo=myrepo \
  title="Fix typo in docs" \
  head=fix-docs-typo \
  base=main \
  maintainer_can_modify=true
```

**Params:** `owner`, `repo`, `title`, `head`, `base` (required); `body`,
`draft`, `maintainer_can_modify` (optional).

---

## Review a pull request

```bash
# Approve
mcporter call github.create_pull_request_review \
  owner=owner repo=myrepo pull_number=42 \
  body="LGTM, ready to merge." \
  event=APPROVE

# Request changes
mcporter call github.create_pull_request_review \
  owner=owner repo=myrepo pull_number=42 \
  body="Please address the security concerns noted in line 45." \
  event=REQUEST_CHANGES

# Comment without state change
mcporter call github.create_pull_request_review \
  owner=owner repo=myrepo pull_number=42 \
  body="Great work on the refactoring!" \
  event=COMMENT
```

**Params:** `owner`, `repo`, `pull_number`, `body`, `event` (required); `event`
must be `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`. Optional: `commit_id`,
`comments` (array of review comments with path/position).

---

## Merge a pull request

```bash
# Default merge method (merge)
mcporter call github.merge_pull_request \
  owner=owner repo=myrepo pull_number=42

# Squash merge (common for clean history)
mcporter call github.merge_pull_request \
  owner=owner repo=myrepo pull_number=42 merge_method=squash

# Rebase merge
mcporter call github.merge_pull_request \
  owner=owner repo=myrepo pull_number=42 merge_method=rebase

# With custom commit message
mcporter call github.merge_pull_request \
  owner=owner repo=myrepo pull_number=42 \
  commit_title="feat: add user authentication" \
  commit_message="Implements login/logout with JWT tokens. Fixes #123."
```

**Params:** `owner`, `repo`, `pull_number` (required); `commit_title`,
`commit_message`, `merge_method` (optional; `merge` \| `squash` \| `rebase`).

---

## Fork a repository

```bash
# Fork to your personal account
mcporter call github.fork_repository owner=earendil-works repo=pi

# Fork to an organization
mcporter call github.fork_repository owner=earendil-works repo=pi organization=myorg
```

**Params:** `owner`, `repo` (required); `organization` (optional, defaults to
your personal account).

---

## Common gotchas

| Gotcha | Solution |
|---|---|
| Updating a file fails without `sha` | Get `sha` from `get_file_contents` first (see above) |
| PR merge fails with "not mergeable" | Check CI status with `get_pull_request_status`, resolve conflicts |
| Branch creation fails with "branch already exists" | Use a different branch name or delete existing branch via git CLI |
| Auth errors on write ops | Ensure `GITHUB_PERSONAL_ACCESS_TOKEN` has correct scopes (`repo`, `public_repo` for public) |

---

## See also

- `../SKILL.md` — top tools and search/read workflows
- `tools.md` — all 26 tools with full signatures