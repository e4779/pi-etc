# lint-check extension

Runs project linters/formatters on changed files after each agent response, and
blocks `git commit --no-verify` so pre-commit hooks stay active. Built on
[nano-staged](https://github.com/usmanyunusov/nano-staged).

This is what closes the loop "agent edits → linter normalises → agent sees
errors and self-corrects" without leaving the pi TUI.

---

## Quickstart (fresh machine)

These are the steps a smaller model (Qwen 3.6-class) can follow on a clean
install. Assumes [pi](https://github.com/earendil-works/pi-coding-agent) is
already installed.

### 1. Install the extension

The extension ships in the [pi-etc](https://gitverse.ru/e4779/pi-etc) package:

```bash
pi install git:git@gitverse.ru:e4779/pi-etc.git
```

This clones pi-etc into `~/.pi/agent/git/gitverse.ru/e4779/pi-etc/` and runs
`npm install` (which picks up `nano-staged` as a dependency).

### 2. Activate the extension in pi

`pi install` adds pi-etc to your settings, but the lint-check extension itself
must be enabled explicitly (pi-etc ships several extensions; not all are on by
default). Either:

- run `pi config` and toggle `[x]` on `lint-check/index.ts` under pi-etc, **or**
- edit `~/.pi/agent/settings.json` and add the extension to the pi-etc entry:

```jsonc
{
  "source": "git:git@gitverse.ru:e4779/pi-etc.git",
  "extensions": [
    "extensions/lint-check/index.ts"   // ← add this line
  ],
  // ...skills etc.
}
```

Restart pi.

### 3. Verify it loaded

`/lint-check` command should be available. Run it; you should see:

```
lint-check config:
   enabled (session): true
   ignoreErrors: []
   maxConsecutiveFailures: 3
   nanoStagedConfig: auto (project .nano-staged.json)
```

### 4. Add `.nano-staged.json` to your project

In the **project root** (the directory containing `.git`):

```json
{
  "**/*.rs": "rustfmt --edition 2021",
  "**/*.{js,ts}": "prettier --write",
  "**/*.py": "ruff check --fix"
}
```

That's it. The next time the agent edits a file in this project, pi runs the
matching command at `agent_end` and surfaces failures in the TUI.

---

## How it works

```
                    ┌─ pre-commit hook (husky / nano-staged CLI)
                    │
.nano-staged.json ──┤
                    │
                    └─ pi lint-check (agent_end, via nano-staged JS API)
```

At `agent_end`:

1. Collect files modified via `edit`/`write` tools during this turn.
2. Resolve the project root by walking up from each modified file until a
   `.nano-staged.json` or `.git` is found. **This is independent of pi's
   `cwd`** — pi can be launched from a sibling/parent directory.
3. Call `nanoStaged({ cwd: projectRoot, unstaged: true, quiet: true })`.
4. nano-staged matches unstaged files against the glob keys, runs the commands,
   collects stdout/stderr.
5. On failure: a compact one-line `notify()` toast + `lint-check ✗` in the
   footer. Full text stored and accessible via `/lint-check → View last errors`.
6. On success: footer stays green, no toast.

The extension is **non-blocking** — agent output is shown immediately; lint
runs asynchronously. The `tool_call` hook additionally strips `--no-verify`
from any `git commit` command the agent issues (defence-in-depth against the
agent circumventing pre-commit hooks).

## Mandatory gate — agent self-correction

This is the whole point of the extension, and the bit that's easy to miss:
**on failure, lint-check feeds the error text back to the agent as a followup
user message** via `pi.sendUserMessage(text, { deliverAs: 'followUp' })`.

The agent receives the message right after its current turn ends, sees the
exact errors, and is expected to fix them and re-verify. This closes the loop
`agent edits → linter fails → agent sees failure → agent self-corrects`,
without the human having to copy-paste TUI output back into the chat.

This is the pi-extension-API equivalent of the Claude Code **Stop hook + `exit
2`** pattern from the Evil Martians article (see `references/`). Until this
was wired up, the extension only showed the human — the agent could quietly
declare work done while the linter was still failing.

### Anti-loop protection

If nano-staged returns the **same errors** on consecutive agent turns, the
extension assumes the agent can't fix them. After `maxConsecutiveFailures`
identical failures (default 3):

- the toast is suppressed,
- the gate stops firing (no followUp message),
- the footer reads `lint-check (suppressed — same errors 3×)` (yellow).

The protection resets when the agent response has no lint errors, or when the
error output changes (different errors). Set `maxConsecutiveFailures: 0` to
disable.

### Contract for the agent

When a followUp arrives titled `lint-check found N errors after your recent
edits to: <files>`:

1. Read the bullet list of errors.
2. Fix the failing files.
3. Re-run the linter yourself (`okf fmt -w <file>`, `prettier --write`,
   whatever's configured) to confirm it passes.
4. Only then consider the work done.

If the same error keeps coming back, the gate will suppress after
`maxConsecutiveFailures` rounds — at that point the human needs to intervene
(the error is beyond the agent's current ability to fix).

## Configuration reference

### `.nano-staged.json` (project-level, required)

Maps glob patterns to commands. nano-staged **appends matched filenames** to
each command. One config feeds both this extension and any pre-commit hook.

```json
{
  "**/*.{js,ts,tsx}": ["oxlint --fix", "tsc --noEmit"],
  "**/*.css": "stylelint --fix",
  "**/*.{json,md,yaml}": "prettier --write",
  "src/**/*.rs": "cargo clippy --fix --allow-dirty"
}
```

For sequential commands (lint then typecheck), use an array — nano-staged runs
array entries in order.

### `~/.pi/extensions/lint-check.json` or `<project>/.pi/extensions/lint-check.json`

```jsonc
{
  // Error substrings to ignore in lint output (substring match)
  "ignoreErrors": ["TS6059", "warning: unused variable"],

  // Max consecutive IDENTICAL failures before suppressing (0 = disable)
  "maxConsecutiveFailures": 3,

  // Custom nano-staged config path (default: auto-discover .nano-staged.json)
  "nanoStagedConfig": "./custom-lint.json"
}
```

Project-level overrides user-level.

---

## Critical gotchas (read these once)

These are the things that will silently break your setup. All of them are
load-bearing — none are obvious from the docs.

### 1. Do NOT use `{}` in commands

nano-staged is **not** lint-staged. The `{}` placeholder is not interpolated;
it gets passed as a literal filename and the linter fails with
"No such file or directory".

```jsonc
// BAD — the literal "{}" is passed as a filename
{"**/*.md": "okf fmt -w {}"}

// GOOD — nano-staged appends filenames itself
{"**/*.md": "okf fmt -w"}
```

### 2. Commands must be in PATH (no relative or `./` paths)

nano-staged's internal `which()` rejects any command containing `/` (a
security measure). This means:

- `./node_modules/.bin/prettier` — **rejected**
- `.okf/okf` — **rejected**
- `prettier` — ✓ resolved via PATH (nano-staged prepends `node_modules/.bin`)
- `okf` — ✓ if installed globally

If you vendor a binary in your repo, symlink it into `~/.local/bin/` or install
it globally (`cargo install`, `npm install -g`, etc.).

### 3. Commands run with `cwd` = git root, not pi's cwd

nano-staged executes each command with the working directory set to the git
toplevel of the project that owns the modified file. Relative paths in your
command resolve from there. The extension itself derives the project root from
the modified files (walking up to `.nano-staged.json` or `.git`), so it works
even when pi is launched from a different directory than the project.

### 4. `nanoStaged is not a function` after install

If you see this in the toast, the installed nano-staged is ESM-only and the
extension failed to unwrap its default export. Update pi-etc to a version
containing the `require('nano-staged').default` fix (commit `67ff6ab` or
later). `pi update git:git@gitverse.ru:e4779/pi-etc.git`.

### 5. The extension is a no-op without `.nano-staged.json`

If no config file is found, nano-staged throws "Create Nano Staged config."
and the toast shows that error. This is expected — drop a `.nano-staged.json`
in the project root and try again.

---

## UI behaviour

| State | Footer | Toast |
|---|---|---|
| Idle, enabled | `lint-check` (dim) | — |
| Running | `lint-check running...` | — |
| Success | `lint-check` (dim) | — |
| Errors (first time) | `lint-check ✗` (red) | one-line summary, e.g. `lint-check: 3 errors — run /lint-check for details` |
| Errors (repeated N×) | `lint-check (suppressed — same errors 3×)` (yellow) | — |

The previous design rendered errors as a bordered widget above the input
field, which looked like a second prompt. That was removed — the toast is now
a single line, and full text is available on demand via `/lint-check → View
last errors`.

### Anti-loop protection

See "Mandatory gate — agent self-correction" above; anti-loop is described
there because it governs both the toast and the followUp gate together.

---

## Interactive `/lint-check` command

- **Disable / Enable** — toggle for current session
- **View current config** — settings + config file paths
- **View last errors (N)** — full text of the most recent failure (only shown
  when there are stored errors)
- **Manage ignored errors** — add/remove `ignoreErrors` substrings
- **Reset config** — reset user/project/both to defaults

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Nothing happens after edits | `.nano-staged.json` missing in project root | Add one (see Quickstart step 4) |
| Nothing happens after edits | No files modified by `edit`/`write` (only `bash` used) | Extension only tracks edit/write |
| `.okf/okf does not exist` / `./bin/foo does not exist` | Command contains `/` — rejected by `which()` | Install tool globally or symlink into PATH (gotcha #2) |
| `nanoStaged is not a function` | Old pi-etc, before ESM-unwrap fix | `pi update git:git@gitverse.ru:e4779/pi-etc.git` |
| `Create Nano Staged config.` | Config file not found from modified file's location | Drop `.nano-staged.json` at project root |
| `noGitRepo` error | Modified file is not inside a git repo | git repo required — `git init` |
| Errors suppressed after 3 turns | Anti-loop protection | Fix errors once, or set `maxConsecutiveFailures: 0` |
| Toast still looks like a second input box | Outdated pi-etc with `setWidget()` | Update pi-etc to ≥ `92d8f7d` |

---

## Requirements

- The project must be a git repository.
- The project must have `.nano-staged.json` (or another nano-staged config
  format) at the root.
- Linters/formatters referenced in the config must be **in PATH** (gotcha #2).
- `pi` with the pi-etc package installed (Quickstart step 1).

> **Robustness:** `nano-staged` is loaded with a guarded `require`. If the
> package is missing for any reason, the extension still loads — pi will not
> crash — and silently skips the post-turn lint run (only `--no-verify`
> stripping remains active).

---

## Hooks used

| Hook | Purpose |
|---|---|
| `tool_call` | Strips `--no-verify` from `git commit` commands |
| `tool_result` | Tracks files modified by `edit` and `write` tools |
| `agent_end` | Runs `nano-staged --unstaged` on changed files (async) |

## Inspiration

The design follows Andrey Sitnik's [Stop writing rules in AGENTS.md](https://evilmartians.com/chronicles/stop-writing-rules-in-agents-md-use-agent-hooks-and-nano-staged-instead)
article. Two offline readings ship in `references/` for context:

- **`references/background.md`** — our wiki synthesis (shorter, with our own
  commentary on how the pattern maps to this extension).
- **`references/evil-martians-article.md`** — the original article, fetched
  verbatim for primary-source reference.

Read these to understand *why* lint-check feeds errors back to the agent
rather than just showing them to the human.

Architecture borrowed from [@prateekmedia/pi-hooks](https://github.com/prateekmedia/pi-hooks)
(core/hook split). Powered by [nano-staged](https://github.com/usmanyunusov/nano-staged).
