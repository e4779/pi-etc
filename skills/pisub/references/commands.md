# pisub Command Reference

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