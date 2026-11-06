# shell-gate

Pre-execution shell hygiene gate for agent shell commands and `.sh` writes.

## Why

Agents write shell fast and sloppy, then burn turns debugging quotes
character by character. The gate blocks the sloppy command BEFORE execution
and hands diagnostics back to the model as the block reason — the fix loop
is one turn, with SC codes in hand.

## Layers

1. `bash --norc -n` — parse check, always available: unbalanced quotes,
   broken heredocs, parse errors. The "unexpected EOF" class.
2. ShellCheck — semantic layer (word splitting, quoting, `rm -rf` on empty
   variables) via `shellcheck-wasm`, executed inside the pi bun runtime.
   No host binary needed: FreeBSD pkg does not package shellcheck. Skips
   silently when the wasm module cannot load.

Both layers fail open: any internal error passes the command through.

## What it does NOT catch

Syntactically clean but operationally dangerous commands (`git clean -fd`,
`pkill -f` self-matches, blind send-keys). Shell hygiene is not operational
safety — that is a different gate.

## Escape hatches

- The model may prepend `# shellcheck disable=SCxxxx` directive lines to
  confirm an intentional pattern (plain bash comments; ShellCheck respects
  them). The block reason lists the exact codes to use.
- `PI_SHELL_GATE=off` disables the gate for a session.
- `~/.pi/agent/shell-gate.json` tunes thresholds — see the header of
  `index.ts` for every key.

User `!`-bash (the `user_bash` event) is never gated.