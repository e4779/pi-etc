# lint-check extension

This extension runs project linters (via [nano-staged](https://github.com/usmanyunusov/nano-staged)) on changed files after each agent response.

## What it does

1. **Runs project linters** — uses the project's `.nano-staged.json` config to lint/format/typecheck changed files
2. **Blocks `git commit --no-verify`** — silently strips the `--no-verify` flag to keep pre-commit hooks active
3. **Shows errors in UI widget** — lint/typecheck errors appear in the pi TUI for the agent to self-correct
4. **Anti-loop protection** — suppresses errors after N consecutive identical failures (default: 3)
5. **`/lint-check` command** — interactive settings (toggle, config, ignored errors, reset)

## How it works

### Hooks used

| Hook | Purpose |
|---|---|
| `tool_call` | Strips `--no-verify` from `git commit` commands (no blocking) |
| `tool_result` | Tracks files modified by `edit` and `write` tools |
| `agent_end` | Runs `nano-staged --unstaged` on changed files (async, non-blocking) |

### Flow

The extension uses your project's **`.nano-staged.json`** — the same config you'd use for pre-commit hooks. One config, two consumers:

```
                    ┌─ pre-commit hook (husky)
                    │
.nano-staged.json ──┤
                    │
                    └─ pi-lint-check (agent_end)
```

At `agent_end`, the extension calls nano-staged's JS API with `unstaged: true`:
- Finds all unstaged (changed but not staged) files via `git status -z`
- Matches them against glob patterns in `.nano-staged.json`
- Runs the configured commands (in parallel per glob group)
- Returns errors from failed commands

This means you can use **any linter** (oxlint, biome, eslint, clippy, etc.) for **any file type** — just configure it in `.nano-staged.json`.

### Example `.nano-staged.json`

```json
{
  "*.{js,ts,tsx}": ["oxlint --fix", "tsc --noEmit"],
  "*.css": "stylelint --fix",
  "*.{json,md,yaml}": "prettier --write",
  "src/**/*.rs": "cargo clippy --fix --allow-dirty"
}
```

> **Tip:** for `tsc --noEmit`, put it as a separate array entry after the linter.
> nano-staged runs array entries sequentially — lint first, then typecheck.

### When linting does NOT run

- No files were modified via `edit`/`write` tools
- Extension is disabled via `/lint-check`
- Anti-loop protection suppresses identical errors (configurable)

## Configuration

Create `~/.pi/extensions/lint-check.json` (user-level) or
`<project>/.pi/extensions/lint-check.json` (project-level, overrides user):

```jsonc
{
  // Error substrings to ignore in lint/typecheck output
  "ignoreErrors": ["TS6059"],

  // Max consecutive identical failures before suppressing (0 = disable)
  "maxConsecutiveFailures": 3,

  // Custom nano-staged config path (default: auto-discover .nano-staged.json)
  "nanoStagedConfig": "./custom-lint.json"
}
```

### Interactive Settings

Use `/lint-check` to manage settings:

- **Toggle on/off** — enable/disable for current session
- **View config** — see current settings and config file paths
- **Manage ignored errors** — add/remove ignored error substrings
- **Reset config** — reset user/project/both to defaults

Status bar shows `lint-check` (green = enabled, yellow = disabled, red = errors).

### Anti-loop protection

If nano-staged returns the **same errors** on consecutive agent turns, the extension assumes the agent can't fix them. After `maxConsecutiveFailures` identical failures (default: 3), the error widget is **suppressed** and the status bar shows `(suppressed — same errors 3×)`. The protection resets when:

- The agent response has no lint/typecheck errors
- The error output changes (different errors)

Set `maxConsecutiveFailures: 0` to disable.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No linting happens | No `.nano-staged.json` in project root | Create one (see example above) |
| No linting happens | No files modified by agent | Extension skips when `edit`/`write` not used |
| `nano-staged` not found | `node_modules` not installed | Run `pi install` again or `npm install` |
| False "no git repo" error | Extension used outside git repo | git repo required for `git status` |
| Linter not found | Tool not installed in project | Install the linter: `npm install -D oxlint` |
| Errors suppressed | Anti-loop kicked in | Fix errors once, or set `maxConsecutiveFailures: 0` |

## Requirements

- The project must be a git repository
- Project must have `.nano-staged.json` (or one of nano-staged's config formats)
- Required linters/tools must be available (`npx oxlint`, `npx tsc`, etc.)

> **Robustness:** `nano-staged` is loaded with a guarded `require`. If the
> package is missing for any reason, the extension still loads — pi will not
> crash — and silently skips the post-turn lint run (only the `--no-verify`
> stripping remains active). Install via `npm install nano-staged` in the
> pi-etc package directory to enable lint runs.

## Inspiration

- [Evil Martians: Stop writing rules in AGENTS.md](https://evilmartians.com/chronicles/stop-writing-rules-in-agents-md-use-agent-hooks-and-nano-staged-instead)
- Architecture from [@prateekmedia/pi-hooks](https://github.com/prateekmedia/pi-hooks) (core/hook split)
- Powered by [nano-staged](https://github.com/usmanyunusov/nano-staged) (zero-dependency git file runner)