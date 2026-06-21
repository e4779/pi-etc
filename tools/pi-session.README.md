# pi-session CLI tool

Parse and inspect [pi coding agent](https://github.com/earendil-works/pi-coding-agent) session JSONL files — using pi's own SDK for guaranteed format compatibility.

Sessions live in `~/.pi/agent/sessions/<project>/`. This tool lets you discover, find, and inspect them without manual `find`/`grep`/shell scripting.

## Features

> **Zero dependencies** — resolves pi's globally installed SDK at runtime. Only needs `npx tsx` (auto-downloaded).

- **Discovery** — list projects, sessions with message counts, fuzzy-find by UUID or project name
- **Inspection** — summaries, first/last messages, filter by role, grep through content (including multi-line)
- **Pipeline-ready** — `--json` flag on all commands, pipe to `jq`/`toonq`/`fx`
- **Always in sync** — uses pi's own `SessionManager` API, no manual JSON parsing

## Quick start

```bash
npx tsx tools/pi-session.ts --help
```

## Commands

### Discovery (no session file needed)

```bash
npx tsx tools/pi-session.ts --list                       # List all projects
npx tsx tools/pi-session.ts --list-sessions              # All sessions with message counts
npx tsx tools/pi-session.ts --list-sessions -v           # Verbose: show session file paths
npx tsx tools/pi-session.ts --list-sessions home-e41q    # Filter by project
npx tsx tools/pi-session.ts --find 019ea19e              # Fuzzy-find by UUID or project name
npx tsx tools/pi-session.ts --find invest                # Find all invest-research sessions
```

### JSON output (pipe to jq/toonq)

```bash
npx tsx tools/pi-session.ts --list --json                # Projects as JSON array
npx tsx tools/pi-session.ts --find invest --json         # Sessions as JSON array of objects
npx tsx tools/pi-session.ts session.jsonl --summary --json  # Message counts as JSON object
npx tsx tools/pi-session.ts session.jsonl --grep "TODO" --json  # Search results as JSON

# Pipeline examples
npx tsx tools/pi-session.ts --find invest --json | toonq --from json -f 'select(.messageCount > 100)'
npx tsx tools/pi-session.ts session.jsonl --json | jq '.[1].text'
```

### Inspection (requires session path)

```bash
npx tsx tools/pi-session.ts <path.jsonl>                 # Show summary + first 3 messages (default)
npx tsx tools/pi-session.ts <path.jsonl> --summary       # Message counts by role
npx tsx tools/pi-session.ts <path.jsonl> --last 20       # Last 20 messages
npx tsx tools/pi-session.ts <path.jsonl> --first 20      # First 20 messages
npx tsx tools/pi-session.ts <path.jsonl> --role user     # All user messages
npx tsx tools/pi-session.ts <path.jsonl> --grep "error"  # Search in message text (multi-line OK)
```

### Quick reference

| Command | Purpose |
|---------|---------|
| `--list` | List projects |
| `--list-sessions [PROJ]` | List sessions with message counts |
| `--list-sessions -v` | List sessions with file paths |
| `--find TEXT` | Fuzzy-find by UUID or project name |
| `--summary` | Message counts by role (default includes first 3 msgs) |
| `--last N` | Last N messages |
| `--first N` | First N messages |
| `--role ROLE` | Filter by role |
| `--grep TEXT` | Search message content (whitespace-normalized, multi-line OK) |
| `--json` | Output as JSON (all commands) — pipe to `jq`/`toonq` |

## How it works

`pi-session.ts` resolves the `@earendil-works/pi-coding-agent` SDK from the global npm installation at runtime. It uses `SessionManager` from pi's SDK to parse session JSONL files — always in sync with pi's format, no matter how the session format evolves.

**`--grep` whitespace normalization:** multi-line shell quotes (`$'line1\nline2'`) are matched against content regardless of newline encoding — both sides are collapsed to single spaces before comparison.

## Requirements

- [pi coding agent](https://github.com/earendil-works/pi-coding-agent) installed globally
- Node.js ≥ 18
- `tsx` (installed automatically via `npx`)