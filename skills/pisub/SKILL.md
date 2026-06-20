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
| `pisub log <name> [--last N]` | Read the JSONL event log (summarised, ~100 chars/event) |
| `pisub report <name> [--last N] [--since TS]` | **FULL** assistant text (not truncated — use for results) |
| `pisub tail <name>` | Live tail (Ctrl-C to stop) |
| `pisub events <name> [--follow] [--filter TYPE]` | Event stream, filterable |
| `pisub wait <name> [--timeout SEC]` | Block until agent idle (exit 0/1) — the missing primitive |
| `pisub run <name> "prompt" [spawn opts] [--timeout SEC]` | **One-shot**: spawn+send+wait+report+kill in one call |
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
| One-shot delegation (fire-and-forget) | **`pisub run <name> "prompt"`** — spawn+send+wait+report+kill in one call. |
| Long-running agent you want to steer | **pisub** (`spawn` + `send` + `steer`). |
| 2+ agents working in parallel | **pisub** (spawn N, send to each, `pisub list` to watch). |
| Agent that should react to your mid-task feedback | **pisub** with `steer`. |
| Fully isolated context (fresh, no parent pollution) | **pisub** (always spawns fresh). |
| `Agent` tool available and task is simple one-shot | Either works. `pisub run` gives you a durable JSONL log; `Agent` tool returns inline. |

## One-shot delegation: `pisub run`

For fire-and-forget tasks (the most common delegation pattern), use `run`. It composes the existing primitives:

```bash
pisub run reviewer "review src/auth/ for bugs" --model zai/glm-5.2 --cwd ~/dev/proj
# = spawn + send + wait + report + kill, in one call
```

The daemon still runs as a real long-lived agent while `run` blocks — you can `pisub tail <name>` from another terminal to watch it work. `run` cleans up (kills) on exit, even on error.

If you want to compose manually (e.g. to inspect intermediate state):

```bash
pisub spawn rc1 --model deepseek/deepseek-v4-pro --cwd ~/dev/proj
pisub send rc1 "implement feature X"
pisub wait rc1 && pisub report rc1
pisub kill rc1
```

`pisub wait` is the missing primitive: it blocks until the agent emits `agent_end` (race-free, watches the log position — not get_state polling, which lies in the gap between `send` accepting a prompt and the stream starting).

`pisub report` prints the **full** assistant text — unlike `pisub log` which summarises each event to ~100 chars. Use `report` when you want the actual answer; use `log` when you want the event timeline.

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
- **Strong roles need `--system-prompt-file`, not `--prompt-file`.** `--prompt-file` *appends* to pi's default system prompt ("You are an expert coding assistant...") — weaker models keep answering from the default identity and ignore the append. For tintinweb-style role agents use `--system-prompt-file` (full *replace*). Tools still work — they're provided separately from the system prompt.
- **`response(get_state)` spam in `pisub log` is normal.** `pisub status`/`wait` poll the daemon's `get_state` to check streaming — each poll shows up as a `response(get_state)` line in the log. It is NOT the agent being stuck; it's pisub's own health check. Filter it out with `pisub log <name> | rg -v get_state` if it bothers you.
- **`wait` is race-free because it watches log position, not get_state.** Earlier versions polled `get_state` and could return "idle" in the gap between `send` accepting a prompt and the stream starting. Now `wait` tracks the JSONL log and returns only when a new `agent_end` event appears.

## Profiles — reusable agents as shell scripts

pisub is intentionally dumb about roles. There is no `pisub agents/` registry, no frontmatter parser, no discovery layer. **A profile is just an executable shell script that calls `pisub spawn` with the right flags.** Pure Unix.

### Layout

```
~/.pisub/
├── profiles/                          # your executable profile scripts
│   ├── rust-coder                     # executable: calls pisub spawn
│   ├── rust-coder.prompt.md           # the role (system prompt)
│   ├── mk-expert
│   ├── mk-expert.prompt.md
│   └── ...
├── agents/<name>.log                 # pisub-owned: per-agent event logs
└── registry.json                     # pisub-owned: live agents
```

### Enable

One line in `~/.bashrc`:

```bash
export PATH="$HOME/.pisub/profiles:$PATH"
```

Then `rust-coder`, `mk-expert`, etc. are ordinary commands with tab-completion, `which`, and `--help` if you add it.

### Anatomy of a profile

`~/.pisub/profiles/rust-coder` (executable):

```sh
#!/bin/sh
# rust-coder — Rust developer sub-agent. Usage: rust-coder <name> [pisub flags...]
exec pisub spawn "$@" \
  --model zai/glm-4.7 \
  --tools read,write,edit,bash \
  --system-prompt-file "$(dirname "$0")/rust-coder.prompt.md"
```

`~/.pisub/profiles/rust-coder.prompt.md` (the role — whatever you'd put in a tintinweb agent body):

```markdown
You are a pragmatic Rust developer. You write production-quality Rust code.

## Style
- Minimal and idiomatic — no unnecessary abstractions
- anyhow::Result for errors, serde for JSON
- cargo check frequently
```

### Usage

```bash
rust-coder rc1                          # spawn named 'rc1' in current dir
rust-coder rc1 --cwd ~/dev/foo          # work in a specific project
rust-coder rc1 --tmux                   # wrap in tmux for live attach
rust-coder rc1 --model deepseek/deepseek-v4-pro   # upgrade for hard task
rust-coder rc1 & rust-coder rc2 &       # two parallel workers
```

Flags passed after `<name>` override the profile's defaults (they come later in the arg list, and pi/pisub use last-wins for the same flag).

### Writing your own profile

1. Write the role as `~/.pisub/profiles/<name>.prompt.md`
2. Write `~/.pisub/profiles/<name>` as a 4-line shell script (copy rust-coder, change model + prompt-file)
3. `chmod +x ~/.pisub/profiles/<name>`
4. Done. No registry, no restart, no config.

Profiles compose like any Unix tool: source one from another for a shared base, add conditionals, read env vars. They're just shell scripts.

## NEVER do this

- Do NOT spawn `pi -p` in tmux for interactive work. It's one-shot. Use pisub.
- Do NOT `tmux send-keys` into a pisub agent. Use `pisub send` / `pisub steer` — that's the whole point.
- Do NOT leave agents running across sessions. `pisub kill --all` before you finish.

## See also

- [pi RPC mode docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md) — the protocol pisub wraps
- [Mario Zechner: "No sub-agents"](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) — the philosophy
- [`pi-session` skill](./../skills/pi-session/SKILL.md) — inspect pi session JSONL files (works on pisub logs too, same format family)
