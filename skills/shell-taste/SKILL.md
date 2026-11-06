---
name: shell-taste
description: "Taste layer for shell code: portable POSIX idioms vs host-shell extras, composability discipline, pre-delivery ritual. Use when writing, reviewing, or refactoring any #!/bin/sh or bash script, rc.d-style service scripts, CLI glue. RU: написать шелл-скрипт, идиоматичный sh, красивый шелл, переписать скрипт на sh."
---

# shell-taste

How to write shell *well*: dialect discipline, idioms, a ritual.
The objective floor is shellcheck — the eslint of shell (rule codes SC####,
severity levels, enable/disable config, inline pragmas) — driven by this
skill's `.shellcheckrc`.

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

## 2. Idioms (the canon)

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

## 3. Ritual before delivering

1. `shfmt -ln posix -s` — apply its rewrite; it enforces idiom mechanically
2. shellcheck with this skill's rc (explicit path, nothing to copy):
   `shellcheck --rcfile <this-skill-dir>/.shellcheckrc script.sh`
   - portable tier: add `-s dash` — the strictest dialect, catches bashisms
     (SC2039 class "In POSIX sh, ... is undefined")
   - host tier on labhost: `-s bash`, or let the shebang deduce
   - many scripts in one repo: drop the rc at repo root as `.shellcheckrc` —
     discovered from each script's directory upward, editors inherit it too
3. Read every unquoted $var aloud; cannot justify it → quote it
4. If the user is taste-learning: offer an A/B variant (toolbox vs loop) and let them pick

Inline pragmas work like eslint-disable (`# shellcheck disable=SC2086`) —
use sparingly, with the reason on the same line.

## 4. Canon (consult on demand)

kn concept `~/kn/bundles/common/expressive-shell.md` · pure-sh-bible
(dylanaraps) · Wooledge wiki (BashPitfalls, BashFAQ/105) · kiss, `/etc/rc.d/*`
on this host.
