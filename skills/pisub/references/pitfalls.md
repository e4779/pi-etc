# pisub Pitfalls & Pipeline Integration

## Common pitfalls

- **NEVER run `pi-session` on a pisub log.** `pi-session` calls pi's
  `SessionManager.open()`, which silently truncates any file that isn't a
  pi session and writes a session header — irreversible data loss. pisub
  logs are RPC event streams, not pi sessions. Inspect them with
  `pisub log`, `pisub report`, or `rg`/`jq`/`toonq`. (pi-session refuses pisub
  logs by content, but don't rely on it — treat `.pisub/agents/*.log` as
  read-only-by-pisub only.)
- **The daemon log (`/tmp/pisub-<uid>/<name>.daemon.log`) is ephemeral.**
  It's a human-readable echo for `pisub attach` and is wiped on reboot.
  The durable record is the NDJSON `~/.pisub/agents/<name>.log` — that's
  what you inspect with `rg`/`jq`/`toonq` and what survives across reboots.
- **Name collisions:** `pisub spawn` refuses if `<name>` is already running. Pick unique names or `pisub kill` first.
- **Dead registry entries:** if a daemon dies ungracefully (kill -9, OOM), `pisub list` runs GC on the registry automatically — stale entries disappear.
- **Steering an idle agent:** `steer` queues for the *current* turn. If the agent is idle, use `send` (prompt) instead — `steer` on idle may hang in queue until the next prompt.
- **`--tools` must include what the agent needs.** If you spawn with `--tools read` and ask it to write code, it fails. Default is safe (`read,write,edit,bash`).
- **Strong roles need `--system-prompt-file`, not `--prompt-file`.** `--prompt-file` *appends* to pi's default system prompt ("You are an expert coding assistant...") — weaker models keep answering from the default identity and ignore the append. For tintinweb-style role agents use `--system-prompt-file` (full *replace*). Tools still work — they're provided separately from the system prompt.
- **`response(get_state)` spam in `pisub log` is normal.** `pisub status`/`wait` poll the daemon's `get_state` to check streaming — each poll shows up as a `response(get_state)` line in the log. It is NOT the agent being stuck; it's pisub's own health check. Filter it out with `pisub log <name> | rg -v get_state` if it bothers you.
- **`wait` is race-free because it watches log position, not get_state.** Earlier versions polled `get_state` and could return "idle" in the gap between `send` accepting a prompt and the stream starting. Now `wait` tracks the JSONL log and returns only when a new `agent_end` event appears.

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