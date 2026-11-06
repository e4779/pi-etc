---
name: shell-taste
description: "Taste layer for shell code: portable POSIX idioms vs host-shell extras, composability discipline, pre-delivery ritual. Use when writing, reviewing, or refactoring any #!/bin/sh or bash script, rc.d-style service scripts, CLI glue. RU: написать шелл-скрипт, идиоматичный sh, красивый шелл, переписать скрипт на sh."
---

# shell-taste

How to write shell *well*: dialect discipline, a hard floor, idioms, a ritual.

## 1. Dialect — portable core by default

Two tiers; pick deliberately. Host-local scripts mark `# dialect: host` on line 2.

- **posix** (default, unmarked): POSIX Issue 7 + `local`. Runs on dash,
  FreeBSD sh, bash, busybox ash, mksh. No pipefail, no $'..'.
- **host**: extras of the host shell. On labhost /bin/sh (probed 2026-11):
  pipefail, $'..', `local` with dynamic scoping, `local -` (options scoped
  to the function, restored on return). bash: same set.

Portability matrix (probed live on labhost 2026-11; dash column from upstream docs):

| feature | POSIX Iss.7 | FreeBSD sh | bash | dash | zsh |
|---|---|---|---|---|---|
| `local`   | no (rationale left it for "a future version") | yes | yes | yes | yes |
| `pipefail`| no | yes | yes | NO | yes |
| `$'..'`   | no | yes | yes | NO | yes |
| `local -` | no | yes | yes | — | (use `setopt local_options`) |

ksh93 has no `local` (use `typeset`).

If correctness *needs* pipefail: restructure — check exit codes explicitly
(`cmd || exit`, while-read loops) instead of leaning on a non-portable option.

## 2. Hard floor (never cross)

- Quote every expansion; `"$@"` never unquoted `$*`; printf, never echo
- Read lines: `while IFS= read -r line` — never parse `ls`
- Lists = positional params: `set --` / `shift` / `"$@"`; no string+IFS emulated lists
- `trap cleanup EXIT INT TERM`; mktemp for temp files; `rm -rf` only on absolute quoted paths
- `cd dir || exit`; usage() in every script; exit codes are the API
- No eval outside data-convention frameworks (rc.subr pattern); never eval user input
- Shebang is a decision: `#!/bin/sh` default; `#!/usr/bin/env bash` only with an inline reason

## 3. Idioms (the canon)

Verbs as functions returning via stdout; case = pattern dispatch;
`${var#pat}` / `${var%%pat}` before sed; heredocs for generated files;
pipelines as dataflow; `set --` as a worklist; metadata-vars + naming
convention (rc.subr style) for multi-script projects.

```sh
log()  { printf '%s: %s\n' "${0##*/}" "$*" >&2; }
die()  { log "error: $*"; exit 1; }
cleanup() { [ -n "$tmp" ] && rm -rf "$tmp"; }
trap cleanup EXIT INT TERM
tmp=$(mktemp -d) || die mktemp
```

## 4. Ritual before delivering

1. `shfmt -ln posix -s` — apply its rewrite; it enforces idiom mechanically
2. shellcheck clean (the shell-gate extension already guards this)
3. Read every unquoted $var aloud; cannot justify it → quote it
4. If the user is taste-learning: offer an A/B variant (toolbox vs loop) and let them pick

## 5. Canon (consult on demand)

kn concept `~/kn/bundles/common/expressive-shell.md` · pure-sh-bible
(dylanaraps) · Wooledge wiki (BashPitfalls, BashFAQ/105) · kiss, `/etc/rc.d/*`
on this host.
