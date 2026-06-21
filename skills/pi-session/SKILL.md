---
name: pi-session
description: "Parse and inspect pi agent session JSONL files. Commands: --summary, --last N, --role ROLE, --grep TEXT, --grep-dir DIR TEXT, --list, --list-sessions, --list-subagents, --find UUID"
---

The `pi-session` tool parses pi agent session JSONL files using the pi agent SDK — always in sync with pi's format.

Sessions live in `~/.pi/agent/sessions/<project>/`.

**Binary:** `npx tsx pi-session.ts` (TypeScript, uses pi agent SDK — always in sync with pi's format)

**Uses `rg` (ripgrep)** for fast cross-session search when available. Falls back to SDK-based search for single-file `--grep`.

## Workflow: discover → search → inspect

**Use pi-session for ALL session discovery. Never use `find`, `ls`, or shell scripts to locate sessions.**

```bash
# Step 1: DISCOVER — find the session you need
pi-session --list                       # List all projects
pi-session --list-sessions              # List all sessions with message counts
pi-session --list-sessions -v           # Verbose: show session file paths
pi-session --list-sessions home-e41q    # Filter by project
pi-session --list-subagents             # List tintinweb subagent output files
pi-session --find 019ea19e              # Fuzzy-find by UUID or project name
pi-session --find rust-coder            # Also finds subagent outputs

# Step 2: SEARCH across sessions (uses rg — milliseconds)
pi-session --grep-dir ~/.pi/agent/sessions/--proj-- "error"       # Search all sessions in dir
pi-session --grep-dir ~/.pi/agent/sessions/--proj-- "error" --role user  # Filter by role
pi-session --grep-dir ~/.pi/agent/sessions/--proj-- "error" --json  # JSON output

# Step 3: INSPECT — once you have the path
pi-session <path.jsonl>                 # Show summary + first 3 messages (default)
pi-session <path.jsonl> --summary       # Message counts by role
pi-session <path.jsonl> --last 20       # Last 20 messages
pi-session <path.jsonl> --first 20      # First 20 messages
pi-session <path.jsonl> --role user     # All user messages
pi-session <path.jsonl> --grep "error"  # Search in message text (multi-line OK)
pi-session <path.jsonl> --grep "error" --role assistant  # Search with role filter

# Step 4: PIPELINE — JSON output for jq/toonq
pi-session --list --json                # Projects as JSON array
pi-session --find invest --json         # Sessions as JSON array
pi-session <path.jsonl> --summary --json  # Message counts as JSON object
pi-session <path.jsonl> --json          # Single JSON: { summary, first: [...] }
pi-session <path.jsonl> --grep "TODO" --json  # Search results as JSON

# Pipe to toonq for compact TOON output
pi-session --find invest --json | toonq --from json --truncate 80
pi-session --grep-dir ~/.pi/agent/sessions/--proj-- "bug" --json | toonq --from json -f 'group_by(.file) | map({file: .[0].file, count: length})'
```

**Quick reference:**

| Command | Purpose |
|---------|---------|
| `--list` | List projects |
| `--list-sessions [PROJ]` | List sessions with message counts |
| `--list-sessions -v` | List sessions with file paths |
| `--list-subagents` | List tintinweb subagent outputs |
| `--find TEXT` | Fuzzy-find by UUID, project, or subagent |
| `--grep-dir DIR TEXT` | **Fast search** across all JSONL in DIR (uses rg) |
| `--grep-dir DIR TEXT --role ROLE` | Search with role filter |
| `--summary` | Message counts by role |
| `--last N` | Last N messages |
| `--first N` | First N messages |
| `--role ROLE` | Filter by role |
| `--grep TEXT` | Search message content (whitespace-normalized) |
| `--grep TEXT --role ROLE` | Search with role filter |
| `--context N TEXT` | **Match TEXT, print N messages around each** (context view) |
| `--context N TEXT --role ROLE` | Context view, restrict matches to ROLE |
| `--tool-usage [REGEX]` | **Tool-call counts** + sample input (filter tool names) |
| `--timeline [N]` | **Workflow**: user msgs + tool calls in order (last N) |
| `--json` | Output as JSON (all commands) — pipe to `jq`/`toonq` |

## How to run

From the skill directory:

```bash
npx tsx pi-session.ts <args>
```

## When to use

- User mentions another agent session — use `--find <text>` to locate it (matches project name or UUID)
- User asks "what did the agent do?" — use `--last N` or **`--timeline`** to see the workflow in order
- Debugging agent behavior — use `--summary` for overview, `--grep` for specifics
- **"Why did the agent change X?"** — use **`--context N TEXT --role ROLE`** to see what was said around the change (replaces ad-hoc Python f-string scripts that always break on quotes-in-queries)
- **"What tools does this session use?"** — use **`--tool-usage`** (add a regex to filter tool names, e.g. `--tool-usage chrome`)
- Need to check what was discussed in a past session — `--find` + `--role user`
- Need the session file path — `--list-sessions -v` shows full paths for copy-pasting into inspection commands
- **Searching across many sessions** — use `--grep-dir` (uses rg, fast) instead of looping with `--grep`
- **Searching with role filter** — `--grep-dir DIR TEXT --role user` finds only user messages
- Doing batch analysis — `--json` + pipe to `jq` or `toonq --from json` for filtering/aggregation

## `--json` is pipeline-safe

All `--json` output is a **single valid JSON document** (object or array). Pipes safely to `toonq --from json` or `jq`.

```bash
pi-session session.jsonl --json | toonq --from json -f '.summary'
pi-session --grep-dir DIR "error" --json | toonq --from json --truncate 100
```

## `--grep` does NOT support regex or `|` alternation

`--grep` and `--grep-dir` perform **literal substring search** (case-insensitive).
The `|` character is not regex alternation — it's treated as literal text.

```bash
# ❌ WRONG: pipe is literal text, won't match either word
pi-session session.jsonl --grep "скилл\|layout"

# ✅ RIGHT: use separate calls or --grep-dir with multiple searches
pi-session --grep-dir DIR "скилл"  # finds Russian text
pi-session session.jsonl --grep "layout"  # finds English text
```

## toonq integration

[toonq](https://gitverse.ru/e4779/toonq) is a `jq`-like query tool for TOON/JSON data.
pi-session's `--json` output pipes directly to toonq for filtering, analysis, and trimming.

### Why TOON / toonq?

- **30-40% fewer tokens** than JSON — saves context budget when reading session data
- **LLM-friendly** — designed with model tokenizers in mind, less syntax noise
- **Human-readable** — table-like format, naturally editable in Vim
- **Single format end-to-end** — discover → filter → inspect, all in TOON pipeline

### Practical pipelines

```bash
# Find all sessions with >100 messages, show project + date
pi-session --find invest --json | \
  toonq --from json -f 'map({project, date}) | sort_by(-.date)'

# Search all sessions, group matches by file, count per file
pi-session --grep-dir DIR "bug" --json | \
  toonq --from json -f 'group_by(.file) | map({file: .[0].file, count: length})'

# Extract only user messages from search results
pi-session --grep-dir DIR "feature" --json | \
  toonq --from json -f 'map(select(.role == "user")) | .[0:10]' --truncate 120

# Pipe session content through toonq for compact viewing
pi-session session.jsonl --json | \
  toonq --from json -f '.first | map({role, text}) | .[0:3]' --truncate 80

# Use toonq --slurp for JSONL-aware parsing (recognizes line-delimited JSON)
pi-session --grep-dir DIR "TODO" --json | \
  toonq --from json --truncate 100
```

## NEVER do this

Do NOT use `find`, `ls`, `grep` shell commands to discover or parse session files. Always use `pi-session`. The only exception is `cat` on non-JSONL files if you absolutely need raw bytes.

**For cross-session search, prefer `--grep-dir` over `rg` directly** — `pi-session` parses JSON structure and extracts clean text from message content. Raw `rg` matches on raw bytes and includes non-message entries.
