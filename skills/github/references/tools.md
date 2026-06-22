# GitHub MCP — Full Tool Reference

> **Read on demand.** All 26 tools across search, issues, PRs, files, and repo
> management. The top 8 tools live in `../SKILL.md`; load this when you need
> write operations or the full surface area.

**Confirm what's live on your box:**
```bash
mcporter list github --brief
mcporter list github --schema   # full params
```

All calls: `mcporter call github.<tool> key=value ...`

---

## Search (4 tools)

### `search_repositories(query, page?, perPage?)` — find repos by query
```bash
mcporter call github.search_repositories query="stars:>1000 language:rust" perPage=3
mcporter call github.search_repositories query="topic:ai language:python" page=2
```
| param | type | req | notes |
|---|---|---|---|
| `query` | string | ✓ | GitHub search syntax (e.g. `stars:>1000 language:rust`) |
| `page` | number | | page number (default: 1) |
| `perPage` | number | | results per page (default: 30, max: 100) |

### `search_code(q, order?, page?, per_page?)` — search code across GitHub
```bash
mcporter call github.search_code q="filename:package.json express in:file"
mcporter call github.search_code q="import React from 'react'" per_page=10
```
| param | type | req | notes |
|---|---|---|---|
| `q` | string | ✓ | search query |
| `order` | string | | `asc` \| `desc` |
| `page` | number | | page number (min: 1) |
| `per_page` | number | | results per page (min: 1, max: 100) |

### `search_issues(q, order?, page?, per_page?, sort?)` — search issues/PRs
```bash
mcporter call github.search_issues q="is:open label:bug repo:owner/name"
mcporter call github.search_issues q="is:pr is:merged author:me" sort=created
```
| param | type | req | notes |
|---|---|---|---|
| `q` | string | ✓ | search query |
| `order` | string | | `asc` \| `desc` |
| `page` | number | | page number (min: 1) |
| `per_page` | number | | results per page (min: 1, max: 100) |
| `sort` | string | | `comments` \| `reactions` \| `interactions` \| `created` \| `updated` |

### `search_users(q, order?, page?, per_page?, sort?)` — find users/orgs
```bash
mcporter call github.search_users q="language:rust location:berlin"
mcporter call github.search_users q="followers:>1000" sort=followers
```
| param | type | req | notes |
|---|---|---|---|
| `q` | string | ✓ | search query |
| `order` | string | | `asc` \| `desc` |
| `page` | number | | page number (min: 1) |
| `per_page` | number | | results per page (min: 1, max: 100) |
| `sort` | string | | `followers` \| `repositories` \| `joined` |

---

## Issues (5 tools)

### `list_issues(owner, repo, direction?, labels?, page?, per_page?, since?, sort?, state?)` — list issues
```bash
mcporter call github.list_issues owner=earendil-works repo=pi state=open
mcporter call github.list_issues owner=owner repo=myrepo state=closed labels=bug,high
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `direction` | string | | `asc` \| `desc` |
| `labels` | string[] | | filter by labels |
| `page` | number | | page number |
| `per_page` | number | | results per page |
| `since` | string | | ISO 8601 timestamp |
| `sort` | string | | `created` \| `updated` \| `comments` |
| `state` | string | | `open` \| `closed` \| `all` |

### `get_issue(owner, repo, issue_number)` — get a single issue
```bash
mcporter call github.get_issue owner=earendil-works repo=pi issue_number=123
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `issue_number` | number | ✓ | issue number |

### `create_issue(owner, repo, title, body?, assignees?, labels?, milestone?)` — file an issue
```bash
mcporter call github.create_issue owner=owner repo=myrepo title="Bug: ..." \
  body="Detailed description..." assignees='["username"]' labels='["bug","high"]'
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `title` | string | ✓ | issue title |
| `body` | string | | issue body/description |
| `assignees` | string[] | | array of usernames |
| `labels` | string[] | | array of label names |
| `milestone` | number | | milestone number |

### `update_issue(owner, repo, issue_number, title?, body?, state?, assignees?, labels?, milestone?)` — update an issue
```bash
mcporter call github.update_issue owner=owner repo=myrepo issue_number=123 state=closed
mcporter call github.update_issue owner=owner repo=myrepo issue_number=123 title="New title"
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `issue_number` | number | ✓ | issue number |
| `title` | string | | new title |
| `body` | string | | new body |
| `state` | string | | `open` \| `closed` |
| `assignees` | string[] | | array of usernames |
| `labels` | string[] | | array of label names |
| `milestone` | number | | milestone number |

### `add_issue_comment(owner, repo, issue_number, body)` — comment on an issue
```bash
mcporter call github.add_issue_comment owner=owner repo=myrepo issue_number=123 \
  body="This is a comment."
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `issue_number` | number | ✓ | issue number |
| `body` | string | ✓ | comment text |

---

## Pull requests (8 tools)

### `list_pull_requests(owner, repo, state?, head?, base?, sort?, direction?, per_page?, page?)` — list PRs
```bash
mcporter call github.list_pull_requests owner=earendil-works repo=pi state=open
mcporter call github.list_pull_requests owner=owner repo=myrepo head=feature-branch
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `state` | string | | `open` \| `closed` \| `all` |
| `head` | string | | filter by head branch |
| `base` | string | | filter by base branch |
| `sort` | string | | `created` \| `updated` \| `popularity` \| `long-running` |
| `direction` | string | | `asc` \| `desc` |
| `per_page` | number | | results per page |
| `page` | number | | page number |

### `get_pull_request(owner, repo, pull_number)` — get a PR
```bash
mcporter call github.get_pull_request owner=earendil-works repo=pi pull_number=42
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `pull_number` | number | ✓ | PR number |

### `get_pull_request_files(owner, repo, pull_number)` — get PR diff
```bash
mcporter call github.get_pull_request_files owner=earendil-works repo=pi pull_number=42
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `pull_number` | number | ✓ | PR number |

### `get_pull_request_status(owner, repo, pull_number)` — get PR CI status
```bash
mcporter call github.get_pull_request_status owner=earendil-works repo=pi pull_number=42
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `pull_number` | number | ✓ | PR number |

### `get_pull_request_comments(owner, repo, pull_number)` — get PR review comments
```bash
mcporter call github.get_pull_request_comments owner=earendil-works repo=pi pull_number=42
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `pull_number` | number | ✓ | PR number |

### `get_pull_request_reviews(owner, repo, pull_number)` — get PR reviews
```bash
mcporter call github.get_pull_request_reviews owner=earendil-works repo=pi pull_number=42
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `pull_number` | number | ✓ | PR number |

### `create_pull_request(owner, repo, title, head, base, body?, draft?, maintainer_can_modify?)` — create a PR
```bash
mcporter call github.create_pull_request owner=owner repo=myrepo \
  title="Add feature X" head=feature-branch base=main body="Description..."
mcporter call github.create_pull_request owner=owner repo=myrepo \
  title="WIP: feature" head=wip-branch base=main draft=true
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `title` | string | ✓ | PR title |
| `head` | string | ✓ | head branch (your changes) |
| `base` | string | ✓ | base branch (target) |
| `body` | string | | PR body/description |
| `draft` | boolean | | create as draft |
| `maintainer_can_modify` | boolean | | allow maintainer edits |

### `create_pull_request_review(owner, repo, pull_number, body, event, commit_id?, comments?)` — review a PR
```bash
mcporter call github.create_pull_request_review owner=owner repo=myrepo pull_number=42 \
  body="LGTM" event=APPROVE
mcporter call github.create_pull_request_review owner=owner repo=myrepo pull_number=42 \
  body="Needs work" event=REQUEST_CHANGES
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `pull_number` | number | ✓ | PR number |
| `body` | string | ✓ | review text |
| `event` | string | ✓ | `APPROVE` \| `REQUEST_CHANGES` \| `COMMENT` |
| `commit_id` | string | | specific commit SHA |
| `comments` | array | | review comments with path/position |

### `merge_pull_request(owner, repo, pull_number, commit_title?, commit_message?, merge_method?)` — merge a PR
```bash
mcporter call github.merge_pull_request owner=owner repo=myrepo pull_number=42
mcporter call github.merge_pull_request owner=owner repo=myrepo pull_number=42 merge_method=squash
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `pull_number` | number | ✓ | PR number |
| `commit_title` | string | | commit title |
| `commit_message` | string | | commit message detail |
| `merge_method` | string | | `merge` \| `squash` \| `rebase` |

### `update_pull_request_branch(owner, repo, pull_number, expected_head_sha?)` — update PR branch
```bash
mcporter call github.update_pull_request_branch owner=owner repo=myrepo pull_number=42
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `pull_number` | number | ✓ | PR number |
| `expected_head_sha` | string | | expected HEAD SHA |

---

## Files (4 tools)

### `get_file_contents(owner, repo, path, branch?)` — read a file
```bash
mcporter call github.get_file_contents owner=earendil-works repo=pi path=README.md
mcporter call github.get_file_contents owner=earendil-works repo=pi path=src/main.rs branch=dev
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `path` | string | ✓ | file path |
| `branch` | string | | branch name (default: repo default) |

### `create_or_update_file(owner, repo, path, content, message, branch, sha?)` — create/update a file
```bash
# Create (sha not needed)
mcporter call github.create_or_update_file owner=owner repo=myrepo path=README.md \
  content="Hello" message="Initial commit" branch=main

# Update (sha REQUIRED)
mcporter call github.create_or_update_file owner=owner repo=myrepo path=README.md \
  content="Hello world" message="Update README" branch=main sha=abc123...
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `path` | string | ✓ | file path |
| `content` | string | ✓ | file content |
| `message` | string | ✓ | commit message |
| `branch` | string | ✓ | branch name |
| `sha` | string | | **required when updating** (get from `get_file_contents`) |

### `push_files(owner, repo, branch, files, message)` — batch push files
```bash
mcporter call github.push_files owner=owner repo=myrepo branch=main \
  --args '{"files":[{"path":"README.md","content":"Hello"},{"path":"src/main.rs","content":"fn main() {}"}],"message":"Initial commit"}'
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `branch` | string | ✓ | branch name |
| `files` | array | ✓ | `[{path, content}, ...]` |
| `message` | string | ✓ | commit message |

### `create_branch(owner, repo, branch, from_branch?)` — create a branch
```bash
mcporter call github.create_branch owner=owner repo=myrepo branch=feature-xyz
mcporter call github.create_branch owner=owner repo=myrepo branch=feature-xyz from_branch=dev
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `branch` | string | ✓ | new branch name |
| `from_branch` | string | | source branch (default: repo default) |

### `list_commits(owner, repo, sha?, page?, perPage?)` — list commits
```bash
mcporter call github.list_commits owner=earendil-works repo=pi
mcporter call github.list_commits owner=earendil-works repo=pi sha=main perPage=10
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `sha` | string | | branch/commit SHA |
| `page` | number | | page number |
| `perPage` | number | | results per page |

---

## Repo management (3 tools)

### `create_repository(name, description?, private?, autoInit?)` — create a repo
```bash
mcporter call github.create_repository name=myrepo description="My repo" private=false autoInit=true
```
| param | type | req | notes |
|---|---|---|---|
| `name` | string | ✓ | repository name |
| `description` | string | | repository description |
| `private` | boolean | | private repo |
| `autoInit` | boolean | | initialize with README.md |

### `fork_repository(owner, repo, organization?)` — fork a repo
```bash
mcporter call github.fork_repository owner=earendil-works repo=pi
mcporter call github.fork_repository owner=earendil-works repo=pi organization=myorg
```
| param | type | req | notes |
|---|---|---|---|
| `owner` | string | ✓ | repository owner |
| `repo` | string | ✓ | repository name |
| `organization` | string | | fork to organization |

---

## See also

- `../SKILL.md` — the top 8 tools and common workflows
- `writes.md` — write operation patterns (issues, PRs, files, branches, reviews)