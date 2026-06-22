---
name: pisub
description: "Spawn and steer pi agents via tmux + RPC mode. Use when you need parallel agents, long-running sub-agents, or mid-flight steering."
---

# pisub — sub-agents the pi way

`pisub` spawns **live** pi agents that you can steer mid-flight. It is the answer to "pi has no sub-agents" that actually works for interactive workflows.

**Binary:** `pisub` (on PATH) → wraps `npx tsx /path/to/pisub.ts`

## Why pisub exists

Pi's philosophy (and the blog post that inspired pi-way) says: *"if you need pi to spawn itself, just ask it to run itself via bash"*.

**The trap:** the naive approach — `tmux new-session -d -s x "pi -p 'task'"` — spawns **one-shot print mode**. It prints and dies. You cannot steer it. `tmux capture-pane` reads a dead screen. `send-keys` into a closed window does nothing. This is why "spawn pi via tmux" never worked for you.

**The fix:** `pi --mode rpc` is a JSONL protocol over stdin/stdout with real `prompt`, `steer`, `follow_up`, `abort` commands. pisub wraps it into a small CLI: you get a persistent pipe, structured steering, full event log, and optional tmux observability.

## Workflow: spawn → send → steer → observe → kill

**Discover available providers/models first** — they vary per machine:
```bash
cat ~/.pi/agent/models.json | jq '.providers | keys'   # list providers
```
Pass `--model <provider>/<model>` to `pisub spawn`. If you see `No API key
found for <provider>`, the name is wrong or not configured on this machine.

```bash
# 1. SPAWN a live agent (daemonized, stays running)
pisub spawn researcher --model <provider>/<model> --cwd ~/dev/proj --tools read,bash

# 2. SEND a task
pisub send researcher "Summarize src/auth/ in 5 bullets."

# 3. STEER mid-flight (delivered after the current turn, before the next LLM call)
pisub steer researcher "Actually focus only on the OAuth flow."

# 4. OBSERVE — pick one
pisub tail researcher              # live event stream, pretty-printed
pisub log researcher --last 20     # last 20 events from the JSONL log
pisub status researcher            # one-line: pid, streaming?, queue, tokens
pisub events researcher --follow   # raw event stream (pipe to jq/toonq)

# 5. KILL when done
pisub kill researcher
```

## Log format & inspection

pisub writes **NDJSON** (one JSON object per line) to
`~/.pisub/agents/<name>.log`. Each line has a `ts` timestamp and an RPC
event `type` (e.g. `response`, `agent_start`, `message_update`,
`tool_execution_start`), plus event-specific fields. This is a live event
stream — not a pi session.

Inspect logs with standard JSONL tools, NOT pisub:

| Need | Tool |
|------|------|
| Search event text | `rg "pattern" ~/.pisub/agents/<name>.log` |
| Filter by event type | `jq -c 'select(.type=="message_update")' <name>.log` |
| Count event types | `jq -r .type <name>.log | sort | uniq -c` |
| Extract assistant text | `jq -r 'select(.type=="message_end" and .message.role=="assistant") | .message.content[] | select(.type=="text") | .text' <name>.log` |
| Compact TOON view | `cat <name>.log | toonq --from json --slurp --truncate 80` |

**Never run `pi-session` on a pisub log** — it calls pi's `SessionManager.open()`
which silently truncates non-session files. pi-session now refuses pisub
logs by content (exit 2), but treat `~/.pisub/agents/*.log` as
read-with-standard-tools only.

## When to use pisub vs the `Agent` tool

| Need | Use |
|------|-----|
| One-shot delegation (fire-and-forget) | **`pisub run <name> "prompt"`** — spawn+send+wait+report+kill in one call. |
| Long-running agent you want to steer | **pisub** (`spawn` + `send` + `steer`). |
| 2+ agents working in parallel | **pisub** (spawn N, send to each, `pisub list` to watch). |
| Agent that should react to your mid-task feedback | **pisub** with `steer`. |
| Fully isolated context (fresh, no parent pollution) | **pisub** (always spawns fresh). |
| `Agent` tool available and task is simple one-shot | Either works. `pisub run` gives you a durable JSONL log; `Agent` tool returns inline. |

## Available sub-agent profiles

Check what's installed before spawning — each profile bundles a role + model:

```bash
ls ~/.pisub/profiles/ | grep -v '\\.md$'
```

Named profiles (e.g. `rust-coder`, `wiki-maintainer`) become ordinary commands
on your PATH after `export PATH="$HOME/.pisub/profiles:$PATH"`. They accept
`<name>` and any `pisub spawn` flags. Use the `--system-prompt-file` flag to
point to a `.prompt.md` for custom roles. Details: [profiles](references/profiles.md).

## One-shot delegation: `pisub run`

For fire-and-forget tasks (the most common delegation pattern), use `run`. It composes the existing primitives:

```bash
pisub run reviewer "review src/auth/ for bugs" --model <provider>/<model> --cwd ~/dev/proj
# = spawn + send + wait + report + kill, in one call
```

The daemon still runs as a real long-lived agent while `run` blocks — you can `pisub tail <name>` from another terminal to watch it work. `run` cleans up (kills) on exit, even on error.

If you want to compose manually (e.g. to inspect intermediate state):

```bash
pisub spawn rc1 --model <provider>/<model> --cwd ~/dev/proj
pisub send rc1 "implement feature X"
pisub wait rc1 && pisub report rc1
pisub kill rc1
```

`pisub wait` is the missing primitive: it blocks until the agent emits `agent_end` (race-free, watches the log position — not get_state polling, which lies in the gap between `send` accepting a prompt and the stream starting).

`pisub report` prints the **full** assistant text — unlike `pisub log` which summarises each event to ~100 chars. Use `report` when you want the actual answer; use `log` when you want the event timeline.

## NEVER do this

- Do NOT spawn `pi -p` in tmux expecting to steer it later. `pi -p` is one-shot: it prints and exits — there is nothing to send to. For interactive/steerable agents use `pisub spawn`. For one-shot delegation use `pisub run`.
- Do NOT `tmux send-keys` into a pisub agent. Use `pisub send` / `pisub steer` — that's the whole point.
- Do NOT leave agents running across sessions. `pisub kill --all` before you finish.

## See also

- [Full command reference](references/commands.md) — all commands, spawn options, parallel patterns, file layout
- [Writing agent profiles](references/profiles.md) — reusable role scripts in ~/.pisub/profiles/
- [Pitfalls & integrations](references/pitfalls.md) — common gotchas, toonq/jq pipelines
- [pi RPC mode docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md) — the protocol pisub wraps
- [Mario Zechner: "No sub-agents"](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) — the philosophy
- [`pi-session` skill](../pi-session/SKILL.md) — inspect pi agent session JSONL files (NOT pisub logs; pisub logs use a different format — inspect those with `rg`/`jq`, see [Log format & inspection](#log-format--inspection) above)
