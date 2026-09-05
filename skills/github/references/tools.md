# GitHub MCP — Full Tool Reference

> **Read on demand.** All 44 tools, generated from the live fabric catalog.
The top tools live in `../SKILL.md`; write-operation patterns in `writes.md`.

**Confirm what's live on your box** (inside `fabric_exec`):
```ts
await tools.call({ ref: "mcp.$servers" });   // server list + tool counts
await tools.list({ provider: "mcp" });       // full catalog
const d = await tools.describe({ ref: "mcp.github.issue_write" }); // one schema
```

All calls: `await mcp.github.<tool>({ ...args })` inside `fabric_exec`.
Server missing? Add it to `~/.mcporter/mcporter.json`, then
`tools.call({ ref: "mcp.$reload" })`.

---

## Identity


### `get_me` — Get details of the authenticated GitHub user. Use this when a request is about the user's own profile for GitHub. Or when information is missing to build other tool calls.
No parameters.

## Search


### `search_repositories` — Find GitHub repositories by name, description, readme, topics, or other metadata. Perfect for discovering projects, finding examples, or locating specific repositories across GitHub.
| param | type | req | enum/values |
|---|---|---|---|
| `minimal_output` | boolean |  |  |
| `order` | string |  | asc \| desc |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `query` | string | ✓ |  |
| `sort` | string |  | stars \| forks \| help-wanted-issues \| updated |

### `search_code` — Fast and precise code search across ALL GitHub repositories using GitHub's native search engine. Best for finding exact symbols, functions, classes, or specific code patterns.
| param | type | req | enum/values |
|---|---|---|---|
| `fields` | array |  |  |
| `order` | string |  | asc \| desc |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `query` | string | ✓ |  |
| `sort` | string |  |  |

### `search_issues` — Search issues using natural-language semantic matching. Best for conceptual or paraphrased queries (e.g. "login fails after password reset"). Already scoped to is:issue.
| param | type | req | enum/values |
|---|---|---|---|
| `fields` | array |  |  |
| `order` | string |  | asc \| desc |
| `owner` | string |  |  |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `query` | string | ✓ |  |
| `repo` | string |  |  |
| `sort` | string |  | comments \| reactions \| reactions-+1 \| reactions--1 \| reactions-smile \| reactions-thinking_face \| reactions-heart \| reactions-tada \| interactions \| created \| updated |

### `search_pull_requests` — Search for pull requests in GitHub repositories using issues search syntax already scoped to is:pr
| param | type | req | enum/values |
|---|---|---|---|
| `fields` | array |  |  |
| `order` | string |  | asc \| desc |
| `owner` | string |  |  |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `query` | string | ✓ |  |
| `repo` | string |  |  |
| `sort` | string |  | comments \| reactions \| reactions-+1 \| reactions--1 \| reactions-smile \| reactions-thinking_face \| reactions-heart \| reactions-tada \| interactions \| created \| updated |

### `search_commits` — Search for commits across GitHub repositories using GitHub's commit search syntax. Useful for finding specific changes, authors, or messages across one or many repositories. Searches the default branch only.
| param | type | req | enum/values |
|---|---|---|---|
| `order` | string |  | asc \| desc |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `query` | string | ✓ |  |
| `sort` | string |  | author-date \| committer-date |

### `search_users` — Find GitHub users by username, real name, or other profile information. Useful for locating developers, contributors, or team members.
| param | type | req | enum/values |
|---|---|---|---|
| `order` | string |  | asc \| desc |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `query` | string | ✓ |  |
| `sort` | string |  | followers \| repositories \| joined |

## Issues — read


### `list_issues` — List issues in a GitHub repository. For pagination, use the 'endCursor' from the previous response's 'pageInfo' in the 'after' parameter.
| param | type | req | enum/values |
|---|---|---|---|
| `after` | string |  |  |
| `direction` | string |  | ASC \| DESC |
| `field_filters` | array |  |  |
| `fields` | array |  |  |
| `labels` | array |  |  |
| `orderBy` | string |  | CREATED_AT \| UPDATED_AT \| COMMENTS |
| `owner` | string | ✓ |  |
| `perPage` | number |  |  |
| `repo` | string | ✓ |  |
| `since` | string |  |  |
| `state` | string |  | OPEN \| CLOSED |

### `issue_read` — Get information about a specific issue in a GitHub repository.
| param | type | req | enum/values |
|---|---|---|---|
| `issue_number` | number | ✓ |  |
| `method` | string | ✓ | get \| get_comments \| get_sub_issues \| get_parent \| get_labels |
| `owner` | string | ✓ |  |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `repo` | string | ✓ |  |

### `list_issue_fields` — List issue fields for a repository or organization. Returns field definitions including name, type (text, number, date, single_select), and for single_select fields the list of valid option names. When repo is omitted, returns org-level fields directly.
| param | type | req | enum/values |
|---|---|---|---|
| `owner` | string | ✓ |  |
| `repo` | string |  |  |

### `list_issue_types` — List supported issue types for a repository or its owner organization. When repo is omitted, returns org-level issue types directly.
| param | type | req | enum/values |
|---|---|---|---|
| `owner` | string | ✓ |  |
| `repo` | string |  |  |

### `get_label` — Get a specific label from a repository.
| param | type | req | enum/values |
|---|---|---|---|
| `name` | string | ✓ |  |
| `owner` | string | ✓ |  |
| `repo` | string | ✓ |  |

## Issues — write


### `issue_write` — Create a new or update an existing issue in a GitHub repository.
| param | type | req | enum/values |
|---|---|---|---|
| `assignees` | array |  |  |
| `body` | string |  |  |
| `duplicate_of` | number |  |  |
| `issue_fields` | array |  |  |
| `issue_number` | number |  |  |
| `labels` | array |  |  |
| `method` | string | ✓ | create \| update |
| `milestone` | number |  |  |
| `owner` | string | ✓ |  |
| `parent_issue_number` | number |  |  |
| `parent_owner` | string |  |  |
| `parent_repo` | string |  |  |
| `repo` | string | ✓ |  |
| `state` | string |  | open \| closed |
| `state_reason` | string |  | completed \| not_planned \| duplicate |
| `title` | string |  |  |
| `type` | ? |  |  |

### `sub_issue_write` — Add a sub-issue to a parent issue in a GitHub repository.
| param | type | req | enum/values |
|---|---|---|---|
| `after_id` | number |  |  |
| `before_id` | number |  |  |
| `issue_number` | number | ✓ |  |
| `method` | string | ✓ |  |
| `owner` | string | ✓ |  |
| `replace_parent` | boolean |  |  |
| `repo` | string | ✓ |  |
| `sub_issue_id` | number | ✓ |  |

### `add_issue_comment` — Add a comment and/or reaction to a specific issue or issue comment in a GitHub repository. Use this tool with pull requests as well (in this case pass pull request number as issue_number), but only if user is not asking specifically to add or react to review comments. At least one of body or reaction is required.
| param | type | req | enum/values |
|---|---|---|---|
| `body` | string |  |  |
| `comment_id` | integer |  |  |
| `issue_number` | number | ✓ |  |
| `owner` | string | ✓ |  |
| `reaction` | string |  | +1 \| -1 \| laugh \| confused \| heart \| hooray \| rocket \| eyes |
| `repo` | string | ✓ |  |

## Pull requests — read


### `list_pull_requests` — List pull requests in a GitHub repository. If the user specifies an author, then DO NOT use this tool and use the search_pull_requests tool instead.
| param | type | req | enum/values |
|---|---|---|---|
| `base` | string |  |  |
| `direction` | string |  | asc \| desc |
| `fields` | array |  |  |
| `head` | string |  |  |
| `owner` | string | ✓ |  |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `repo` | string | ✓ |  |
| `sort` | string |  | created \| updated \| popularity \| long-running |
| `state` | string |  | open \| closed \| all |

### `pull_request_read` — Get information on a specific pull request in GitHub repository.
| param | type | req | enum/values |
|---|---|---|---|
| `after` | string |  |  |
| `method` | string | ✓ | get \| get_diff \| get_status \| get_files \| get_commits \| get_review_comments \| get_reviews \| get_comments \| get_check_runs |
| `owner` | string | ✓ |  |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `pullNumber` | number | ✓ |  |
| `repo` | string | ✓ |  |

## Pull requests — write


### `create_pull_request` — Create a new pull request in a GitHub repository.
| param | type | req | enum/values |
|---|---|---|---|
| `base` | string | ✓ |  |
| `body` | string |  |  |
| `draft` | boolean |  |  |
| `head` | string | ✓ |  |
| `maintainer_can_modify` | boolean |  |  |
| `owner` | string | ✓ |  |
| `repo` | string | ✓ |  |
| `reviewers` | array |  |  |
| `title` | string | ✓ |  |

### `update_pull_request` — Update an existing pull request in a GitHub repository.
| param | type | req | enum/values |
|---|---|---|---|
| `base` | string |  |  |
| `body` | string |  |  |
| `draft` | boolean |  |  |
| `maintainer_can_modify` | boolean |  |  |
| `owner` | string | ✓ |  |
| `pullNumber` | number | ✓ |  |
| `repo` | string | ✓ |  |
| `reviewers` | array |  |  |
| `state` | string |  | open \| closed |
| `title` | string |  |  |

### `update_pull_request_branch` — Update the branch of a pull request with the latest changes from the base branch.
| param | type | req | enum/values |
|---|---|---|---|
| `expectedHeadSha` | string |  |  |
| `owner` | string | ✓ |  |
| `pullNumber` | number | ✓ |  |
| `repo` | string | ✓ |  |

### `merge_pull_request` — Merge a pull request in a GitHub repository.
| param | type | req | enum/values |
|---|---|---|---|
| `commit_message` | string |  |  |
| `commit_title` | string |  |  |
| `expectedHeadSha` | string |  |  |
| `merge_method` | string |  | merge \| squash \| rebase |
| `owner` | string | ✓ |  |
| `pullNumber` | number | ✓ |  |
| `repo` | string | ✓ |  |

### `pull_request_review_write` — Create and/or submit, delete review of a pull request.

Available methods:
- create: Create a new review of a pull request. If "event" parameter is provided, the review is submitted. If "event" is omitted, a pending review is created.
- submit_pending: Submit an existing pending review of a pull request. This requires that a pending review exists for the current user on the specified pull request. The "body" and "event" parameters are used when submitting the review.
- delete_pending: Delete an existing pending review of a pull request. This requires that a pending review exists for the current user on the specified pull request.
- resolve_thread: Resolve a review thread. Requires only "threadId" parameter with the thread's node ID (e.g., PRRT_kwDOxxx). The owner, repo, and pullNumber parameters are not used for this method. Resolving an already-resolved thread is a no-op.
- unresolve_thread: Unresolve a previously resolved review thread. Requires only "threadId" parameter. The owner, repo, and pullNumber parameters are not used for this method. Unresolving an already-unresolved thread is a no-op.

| param | type | req | enum/values |
|---|---|---|---|
| `body` | string |  |  |
| `commitID` | string |  |  |
| `event` | string |  | APPROVE \| REQUEST_CHANGES \| COMMENT |
| `method` | string | ✓ | create \| submit_pending \| delete_pending \| resolve_thread \| unresolve_thread |
| `owner` | string | ✓ |  |
| `pullNumber` | number | ✓ |  |
| `repo` | string | ✓ |  |
| `threadId` | string |  |  |

### `add_comment_to_pending_review` — Add review comment to the requester's latest pending pull request review. A pending review needs to already exist to call this (check with the user if not sure).
| param | type | req | enum/values |
|---|---|---|---|
| `body` | string | ✓ |  |
| `line` | number |  |  |
| `owner` | string | ✓ |  |
| `path` | string | ✓ |  |
| `pullNumber` | number | ✓ |  |
| `repo` | string | ✓ |  |
| `side` | string |  | LEFT \| RIGHT |
| `startLine` | number |  |  |
| `startSide` | string |  | LEFT \| RIGHT |
| `subjectType` | string | ✓ | FILE \| LINE |

### `add_reply_to_pull_request_comment` — Add a reply and/or reaction to an existing pull request comment. This can create a new comment linked as a reply to the specified comment, add an emoji reaction to the specified comment, or do both. At least one of body or reaction is required.
| param | type | req | enum/values |
|---|---|---|---|
| `body` | string |  |  |
| `commentId` | number | ✓ |  |
| `owner` | string | ✓ |  |
| `pullNumber` | number |  |  |
| `reaction` | string |  | +1 \| -1 \| laugh \| confused \| heart \| hooray \| rocket \| eyes |
| `repo` | string | ✓ |  |

### `request_copilot_review` — Request a GitHub Copilot code review for a pull request. Use this for automated feedback on pull requests, usually before requesting a human reviewer.
| param | type | req | enum/values |
|---|---|---|---|
| `owner` | string | ✓ |  |
| `pullNumber` | number | ✓ |  |
| `repo` | string | ✓ |  |

### `assign_copilot_to_issue` — Assign Copilot to a specific issue in a GitHub repository.

This tool can help with the following outcomes:
- a Pull Request created with source code changes to resolve the issue


More information can be found at:
- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent

| param | type | req | enum/values |
|---|---|---|---|
| `base_ref` | string |  |  |
| `custom_instructions` | string |  |  |
| `issue_number` | number | ✓ |  |
| `owner` | string | ✓ |  |
| `repo` | string | ✓ |  |

## Files


### `get_file_contents` — Get the contents of a file or directory from a GitHub repository
| param | type | req | enum/values |
|---|---|---|---|
| `fields` | array |  |  |
| `owner` | string | ✓ |  |
| `path` | string |  |  |
| `ref` | string |  |  |
| `repo` | string | ✓ |  |
| `sha` | string |  |  |

### `create_or_update_file` — Create or update a single file in a GitHub repository. 
If updating, you should provide the SHA of the file you want to update. Use this tool to create or update a file in a GitHub repository remotely; do not use it for local file operations.

To obtain the current blob SHA before updating, call the get_file_contents tool with the same owner, repo, and path, and set its ref parameter to this tool's branch value. The first text result reports the blob SHA for the requested path.

SHA MUST be provided for existing file updates.

| param | type | req | enum/values |
|---|---|---|---|
| `allow_symlink_write` | boolean |  |  |
| `branch` | string | ✓ |  |
| `content` | string | ✓ |  |
| `message` | string | ✓ |  |
| `owner` | string | ✓ |  |
| `path` | string | ✓ |  |
| `repo` | string | ✓ |  |
| `sha` | string |  |  |

### `push_files` — Push multiple files to a GitHub repository in a single commit
| param | type | req | enum/values |
|---|---|---|---|
| `branch` | string | ✓ |  |
| `files` | array | ✓ |  |
| `message` | string | ✓ |  |
| `owner` | string | ✓ |  |
| `repo` | string | ✓ |  |

### `delete_file` — Delete a file from a GitHub repository
| param | type | req | enum/values |
|---|---|---|---|
| `branch` | string | ✓ |  |
| `message` | string | ✓ |  |
| `owner` | string | ✓ |  |
| `path` | string | ✓ |  |
| `repo` | string | ✓ |  |

## Commits & refs


### `get_commit` — Get details for a commit from a GitHub repository
| param | type | req | enum/values |
|---|---|---|---|
| `detail` | string |  | none \| stats \| full_patch |
| `owner` | string | ✓ |  |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `repo` | string | ✓ |  |
| `sha` | string | ✓ |  |

### `list_commits` — Get list of commits of a branch in a GitHub repository. Returns at least 30 results per page by default, but can return more if specified using the perPage parameter (up to 100).
| param | type | req | enum/values |
|---|---|---|---|
| `author` | string |  |  |
| `fields` | array |  |  |
| `owner` | string | ✓ |  |
| `page` | number |  |  |
| `path` | string |  |  |
| `perPage` | number |  |  |
| `repo` | string | ✓ |  |
| `sha` | string |  |  |
| `since` | string |  |  |
| `until` | string |  |  |

### `create_branch` — Create a new branch in a GitHub repository
| param | type | req | enum/values |
|---|---|---|---|
| `branch` | string | ✓ |  |
| `from_branch` | string |  |  |
| `owner` | string | ✓ |  |
| `repo` | string | ✓ |  |

### `list_branches` — List branches in a GitHub repository
| param | type | req | enum/values |
|---|---|---|---|
| `owner` | string | ✓ |  |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `repo` | string | ✓ |  |

### `get_tag` — Get details about a specific git tag in a GitHub repository
| param | type | req | enum/values |
|---|---|---|---|
| `owner` | string | ✓ |  |
| `repo` | string | ✓ |  |
| `tag` | string | ✓ |  |

### `list_tags` — List git tags in a GitHub repository
| param | type | req | enum/values |
|---|---|---|---|
| `owner` | string | ✓ |  |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `repo` | string | ✓ |  |

## Releases


### `get_latest_release` — Get the latest release in a GitHub repository
| param | type | req | enum/values |
|---|---|---|---|
| `owner` | string | ✓ |  |
| `repo` | string | ✓ |  |

### `get_release_by_tag` — Get a specific release by its tag name in a GitHub repository
| param | type | req | enum/values |
|---|---|---|---|
| `owner` | string | ✓ |  |
| `repo` | string | ✓ |  |
| `tag` | string | ✓ |  |

### `list_releases` — List releases in a GitHub repository
| param | type | req | enum/values |
|---|---|---|---|
| `fields` | array |  |  |
| `owner` | string | ✓ |  |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `repo` | string | ✓ |  |

## Repository


### `create_repository` — Create a new GitHub repository in your account or specified organization
| param | type | req | enum/values |
|---|---|---|---|
| `autoInit` | boolean |  |  |
| `description` | string |  |  |
| `name` | string | ✓ |  |
| `organization` | string |  |  |
| `private` | boolean |  |  |

### `fork_repository` — Fork a GitHub repository to your account or specified organization
| param | type | req | enum/values |
|---|---|---|---|
| `organization` | string |  |  |
| `owner` | string | ✓ |  |
| `repo` | string | ✓ |  |

### `get_teams` — Get details of the teams the user is a member of. Limited to organizations accessible with current credentials
| param | type | req | enum/values |
|---|---|---|---|
| `user` | string |  |  |

### `get_team_members` — Get member usernames of a specific team in an organization. Limited to organizations accessible with current credentials
| param | type | req | enum/values |
|---|---|---|---|
| `org` | string | ✓ |  |
| `team_slug` | string | ✓ |  |

### `list_repository_collaborators` — List collaborators of a GitHub repository. Results are paginated; the response includes `nextPage`, `prevPage`, `firstPage`, and `lastPage` fields. To get the next page, use the `nextPage` value as the `page` parameter.
| param | type | req | enum/values |
|---|---|---|---|
| `affiliation` | string |  | outside \| direct \| all |
| `owner` | string | ✓ |  |
| `page` | number |  |  |
| `perPage` | number |  |  |
| `repo` | string | ✓ |  |

---

## See also

- `../SKILL.md` — top tools, rename map, recipes
- `writes.md` — write-operation patterns (sha gotcha, batch push, reviews)
