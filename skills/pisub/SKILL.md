---
name: pisub
description: "Spawn and steer pi agents via tmux + RPC mode. Commands: spawn, send (--steer/--follow-up), prompt, steer, follow-up, abort, bash, status, list, events (--follow), log, tail, kill, attach, help. Use when you need parallel agents, long-running sub-agents, or mid-flight steering."
---

# pisub — sub-agents the pi way

`pisub` spawns **live** pi agents that you can steer mid-flight. It is the answer to "pi has no sub-agents" that actually works for interactive workflows.

**Binary:** `pisub` (on PATH) → wraps `npx tsx /path/to/pisub.ts`

## Why pisub exists

Pi's philosophy (and the blog post that inspired pi-way) says: *"if you need pi to spawn itself, just ask it to run itself via bash"*.

**The trap:** the naive approach — `tmux new-session -d -s x "pi -p 'task'"` — spawns **one-shot print mode**. It prints and dies. You cannot steer it. `tmux capture-pane` reads a dead screen. `send-keys` into a closed window does nothing. This is why "spawn pi via tmux" never worked for you.

**The fix:** `pi --mode rpc` is a JSONL protocol over stdin/stdout with real `prompt`, `steer`, `follow_up`, `abort` commands. pisub wraps it into a small CLI: you get a persistent pipe, structured steering, full event log, and optional tmux observability.

## Workflow: spawn → send → steer → observe → kill

```bash
# 1. SPAWN a live agent (daemonized, stays running)
pisub spawn researcher --model deepseek/deepseek-v4-flash --cwd ~/dev/proj --tools read,bash

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

## Command reference

| Command | Purpose |
|---------|---------|
| `pisub spawn <name> [opts]` | Launch `pi --mode rpc` as a daemon |
| `pisub send <name> "msg"` | Prompt (default mode) |
| `pisub send <name> "msg" --steer` | Queue mid-flight (after current turn) |
| `pisub send <name> "msg" --follow-up` | Queue after agent idle |
| `pisub prompt <name> "msg"` | Alias for `send` |
| `pisub steer <name> "msg"` | Shorthand for `send --steer` |
| `pisub follow-up <name> "msg"` | Shorthand for `send --follow-up` |
| `pisub abort <name>` | Abort the current turn |
| `pisub bash <name> "cmd"` | Run bash in agent context (output attached to next prompt) |
| `pisub list` | All active agents (one-line each) |
| `pisub status [name]` | Detailed status (with `name`: model, cwd, tokens, queue) |
| `pisub log <name> [--last N]` | Read the JSONL event log |
| `pisub tail <name>` | Live tail (Ctrl-C to stop) |
| `pisub events <name> [--follow] [--filter TYPE]` | Event stream, filterable |
| `pisub kill <name>` | Terminate one agent |
| `pisub kill --all` | Terminate every agent + clean tmux |
| `pisub attach <name>` | tmux attach to live view (requires `--tmux` at spawn) |
| `pisub help` | Full reference + examples |

## spawn options

```
pisub spawn <name> [--model M] [--provider P] [--cwd DIR] [--tools T]
                   [--thinking off|low|medium|high] [--session] [--tmux]
```

- `--model` accepts `provider/model` shorthand, e.g. `zai/glm-5.2`, `deepseek/deepseek-v4-flash`. If you give `provider/model`, you can omit `--provider`.
- `--tools` defaults to pi's builtin `read,write,edit,bash`. Restrict for safety (`read,bash`) or extend with mcporter/extension tools.
- `--no-session` is the **default** — sub-agents are ephemeral. The pisub JSONL log is the durable record. Pass `--session` to also keep the pi session file in `~/.pi/agent/sessions/`.
- `--tmux` wraps the daemon's output in a tmux session `pisub-<name>` so a human can `pisub attach <name>` and watch live.

## When to use pisub vs the `Agent` tool

| Need | Use |
|------|-----|
| One-shot research → artifact → fresh session | Mario's recommended flow: a separate `pi` session by hand, save to a file, reference it later. **Not pisub.** |
| Code review of a diff | `pi -p "review this diff"` one-shot. **Not pisub.** |
| Long-running agent you want to steer | **pisub.** |
| 2+ agents working in parallel | **pisub** (spawn N, send to each, `pisub list` to watch). |
| Agent that should react to your mid-task feedback | **pisub** with `steer`. |
| Fully isolated context (fresh, no parent pollution) | **pisub** (always spawns fresh). |

## Parallel agents pattern

```bash
# Spawn two workers on the same project
pisub spawn impl    --model deepseek/deepseek-v4-pro  --cwd ~/dev/proj --tools read,write,edit,bash
pisub spawn review  --model zai/glm-5.2               --cwd ~/dev/proj --tools read,bash --tmux

# Give them work
pisub send impl    "Implement feature X in src/feature.ts. Write tests."
pisub follow-up review "After impl finishes, review the diff in src/feature.ts. Be harsh."

# Watch both
pisub list
pisub tail impl

# When impl is done, the review follow-up fires automatically.
# Steer review if needed:
pisub steer review "Focus especially on error handling."

# Clean up
pisub kill --all
```

## Files & layout

```
~/.pisub/
├── registry.json             name → { pid, model, cwd, started, tmuxSession }
├── agents/<name>.log         JSONL event stream (per-agent, append-only, survives crash)
└── agents/<name>.stdin       every command you sent (audit trail)
/tmp/pisub-<uid>/
├── <name>.sock               daemon unix socket
└── <name>.daemon.log         daemon stdout (what tmux pane shows)
```

The JSONL event log is the durable artifact. If the daemon crashes or you kill it, `pisub log <name>` still works — you can reconstruct what happened. The schema matches pi's [RPC event types](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md#events).

## `--json` pipeline integration

Every observation command (`list`, `status`, `events`) prints compact human text by default. For pipeline use, pipe through `toonq` or `jq`:

```bash
# Find which agents are mid-tool-call
pisub events impl --filter tool_execution_start | tail -5

# Registry as JSON for scripting
cat ~/.pisub/registry.json | toonq --from json

# Replay a crashed agent's assistant text
pisub events dead-agent --filter message_update | toonq --from json
```

## Common pitfalls

- **Name collisions:** `pisub spawn` refuses if `<name>` is already running. Pick unique names or `pisub kill` first.
- **Dead registry entries:** if a daemon dies ungracefully (kill -9, OOM), `pisub list` runs GC on the registry automatically — stale entries disappear.
- **Steering an idle agent:** `steer` queues for the *current* turn. If the agent is idle, use `send` (prompt) instead — `steer` on idle may hang in queue until the next prompt.
- **`--tools` must include what the agent needs.** If you spawn with `--tools read` and ask it to write code, it fails. Default is safe (`read,write,edit,bash`).

## NEVER do this

- Do NOT spawn `pi -p` in tmux for interactive work. It's one-shot. Use pisub.
- Do NOT `tmux send-keys` into a pisub agent. Use `pisub send` / `pisub steer` — that's the whole point.
- Do NOT leave agents running across sessions. `pisub kill --all` before you finish.

## See also

- [pi RPC mode docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md) — the protocol pisub wraps
- [Mario Zechner: "No sub-agents"](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) — the philosophy
- [`pi-session` skill](./../skills/pi-session/SKILL.md) — inspect pi session JSONL files (works on pisub logs too, same format family)
