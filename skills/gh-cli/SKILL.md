---
name: gh-cli
description: >
  GitHub operations via the gh CLI: search repos/code/issues/PRs, read
  files without cloning, issues/PRs read and write, releases, commits,
  branches, Actions/CI runs and logs, and the full REST API via gh api.
  Use for ANY github.com touchpoint: a repo URL in the message, "check CI
  runs", "latest release of X", "who maintains Y", "what changed in Z",
  "who uses pattern P across GitHub". gh is pre-authenticated — check
  "gh auth status" when calls fail. The github skill covers the MCP
  natives (homelab only); this is the CLI path for every machine. Not for
  local git work — use git CLI. RU: поищи на гитхабе, открой
  файл/репозиторий без клонирования, проверь релизы или CI, найди issue
  или PR, создай issue/PR.
---

# GitHub via gh CLI (gh-cli)

gh is the primary GitHub interface: installed and authenticated
(`gh auth status` shows account and token scopes). Every recipe runs
as-is in `pi.bash`; prefer `--json` + `--jq` for structured output,
pipe long lists through toonq/jq and return a digest.

## When to use

- Any github.com touchpoint: search, read files without cloning, issues,
  PRs, CI runs and logs, releases, cross-repo "who uses X".
- `gh api` covers everything the CLI has no verb for — full REST escape hatch.
- NOT for local git work (clone/commit/push) — use git CLI; gh auth already
  provides ssh credentials for git over ssh.

## Recipes

```bash
# Search
gh search repos "language:rust stars:>1000" --limit 5 \
  --json fullName,stargazersCount,description
gh search code "ctx_read" --repo e4779/pi-fabric --json path,repository
gh search issues "memory leak" --repo o/r --state open --json number,title

# Read a file without cloning (raw, no base64); any ref via ?ref=
gh api repos/o/r/contents/README.md -H "Accept: application/vnd.github.raw"

# Issues
gh issue list -R o/r --state open --json number,title,author
gh issue view 42 -R o/r --comments
gh issue create -R o/r --title "Bug: ..." --body "..." --label bug

# Pull requests
gh pr list -R o/r --state open
gh pr view 7 -R o/r --json state,mergeable,reviewDecision,statusCheckRollup
gh pr diff 7 -R o/r          # the patch
gh pr checks 7 -R o/r        # CI status per check
gh pr create -R o/r --title "..." --body "..." --base main

# Actions / CI
gh run list -R o/r --limit 5
gh run view <run-id> -R o/r --log-failed   # failed jobs only
gh run watch <run-id> -R o/r               # stream until finished
gh workflow run ci.yml -R o/r              # needs workflow scope — see Notes

# Releases & commits
gh release list -R o/r --limit 5
gh release view v1.2.3 -R o/r --json assets
gh api "repos/o/r/commits?sha=main&per_page=5" --jq '.[].commit.message'
```

## Notes

- **Auth**: token in `~/.config/gh/hosts.yml`. Missing `workflow` scope →
  workflow triggers and pushes touching `.github/workflows` fail with 403;
  fix: `gh auth refresh -s workflow`.
- **Structured output**: prefer `--json a,b,c` (+ `--jq`) over text output.
- **In fabric_exec**: batch independent gh calls in one `pi.bash` (several
  commands) or `Promise.all` of `pi.bash` calls.
- **Rate limits**: same REST API underneath; `gh api rate_limit` to check.

## Related

- The `github` skill covers the MCP natives (`mcp.github.*`) — configured
  on homelab only. Prefer gh for uniformity across machines.
- Remote GitHub MCP (api.githubcopilot.com) is geo-blocked from RU IPs
  (403) — do not suggest it on RU machines.
