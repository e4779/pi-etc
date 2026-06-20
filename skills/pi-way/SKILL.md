---
name: pi-way
description: The pi philosophy — less is more, Unix-way, files over built-in features. Use subagents, tmux, TODO.md, PLAN.md, and file-based artifacts. Use when the user asks about sub-agents, task tracking, planning, background processes, or wants to understand how to work the pi way.
---

# The Pi Way

Pi is a minimal, opinionated coding agent harness by Mario Zechner. Philosophy: **less is more**, **context engineering is paramount**, **bash is the universal interface**.

This skill teaches you — the model — how to work *with* pi, not against it.

Inspiration: [Mario Zechner's blog](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/).

---

## Core Principles

1. **Context is precious** — Progressive disclosure: load details only on demand. Don't dump.
2. **Observability** — Write plans, todos, tracking to files. User sees everything. Nothing hidden.
3. **Bash is the universal tool** — CLI tools, scripts. README-driven discovery: read the README before using a tool.
4. **Autonomous execution by default** — No permission prompts. Full filesystem access.

---

## Explore Your Tools

You have more than just read/write/edit/bash. Before you start working, understand what's available:

- **`mcporter`** — MCP servers behind progressive disclosure. ALWAYS search → describe → call. Never call without describing the schema first. Explore all available servers.
- **`Agent`** — Alternative one-shot sub-agent delegation (@tintinweb/pi-subagents) when you want inline results. For most cases prefer `pisub`.
- **`pisub`** — Live, steerable sub-agents via tmux + RPC. Use for long-running, parallel, or interactive work. Read the `pisub` skill before first use.
- **Extension tools** — mcporter bridge, powershell utilities, and others. They're in your tool list — read their descriptions.

**Rule**: before using any mcporter tool for the first time, call `describe` to get its schema.

---

## Sub-Agents — pick by interactivity

Pi has no built-in sub-agents. Two paths, **choose by whether you need to steer**:

### Option A: `pisub` (recommended default)

`pisub` wraps `pi --mode rpc` — a real JSONL protocol with `prompt`, `steer`, `follow_up`, `abort`. Works for **both** one-shot and long-running work:

See the **`pisub` skill** for commands and patterns. Quick reference: `pisub run <name> "task"` for one-shot, `pisub spawn` + `pisub steer` for interactive.

### Option B: `Agent` tool (@tintinweb/pi-subagents)

Alternative for one-shot delegation when you want the result returned inline (no separate process, no JSONL log). Spawns a fresh sub-agent, runs it, returns the result as a tool result.

```json
Agent({ subagent_type: "Explore", description: "Find auth files", prompt: "..." })
Agent({ subagent_type: "rust-coder", description: "Fix auth bug", prompt: "...", run_in_background: true })
```

Use when: you want inline results, the Agent extension is available, and you don't need a durable log or mid-flight steering. For everything else, `pisub`.

#### Creating one-shot agent types

Write a `.md` file in `~/.pi/agent/agents/`:

```markdown
---
name: my-agent
description: What this agent does
model: deepseek/deepseek-v4-flash
tools: read, write, edit, bash
---
You are a [role]. Your job is to [specific task].
```

**Models**: `deepseek/deepseek-v4-flash` for routine, `deepseek/deepseek-v4-pro` for complex. Reserve expensive models for your main session.

### ⚠️ NEVER spawn `pi -p` in tmux expecting to steer it

`pi -p` (print mode) is one-shot: it prints and dies. You cannot steer it. `tmux capture-pane` reads a dead screen; `send-keys` into a closed window does nothing. This is the trap that makes "spawn pi via tmux" feel broken. For one-shot delegation use `pisub run` (or `pi -p` directly in the foreground — that's fine, just don't expect to steer it). For interactive sub-agents, use `pisub spawn`.

### When to delegate

- **One-shot delegation (any kind)** → `pisub run <name> "prompt"` (or `Agent` tool if you prefer inline results — both work)
- **Code generation** → rust-coder, script-kiddie (via pisub profile or Agent)
- **Research → artifact** → researcher, then start a fresh session with the artifact
- **Exploration** → Explore (fast codebase search)
- **Long-running worker you want to watch** → `pisub`
- **Parallel agents on independent tasks** → `pisub` (spawn N, `pisub list` to watch)
- **Agent you need to redirect mid-task** → `pisub` with `steer`
- **Review loop** → worker implements → reviewer checks with fresh context → fix → repeat (max 3)

---

## Make — the orchestrator

Make is your telescope. **Data flows through it — recipes are lenses that focus and transform.**

```makefile
# Data pipeline: raw → processed → analyzed
data/raw/%.csv:
	curl -o $@ https://...

data/processed/%.json: data/raw/%.csv
	cargo xtask convert $< $@

data/results/report.md: data/processed/%.json
	# Agent reads data, writes findings
```

**Why Make**:
- Dependencies track what changed — only stale tasks re-run
- The Makefile IS the documentation — no separate README needed
- `make target` is a one-word command
- Files are the interface between agents

### Sub-agent workflow with Make

```
subs/
├── tasks/     # Task descriptions (commit to git)
├── data/      # Extracted data for agents (.gitignore)
└── results/   # Agent outputs (.gitignore)
```

```makefile
subs/results/research.md: subs/tasks/research.md subs/data/api-docs.txt
	# Agent: read task + data → write result
```

**Pre-extract data** for sub-agents. Don't make agents dig through external sources — write a script, save to `subs/data/`, feed to agent.

---

## PLAN.md & TODO.md

No built-in plan mode or task tracker. Use files:

```markdown
# PLAN.md
## Goal
Refactor auth to support OAuth 2.0
## Approach
1. Research OAuth flows
2. Design token storage
3. Implement endpoints
4. Add tests
## Current Step
Step 3 — authorization endpoints
```

```markdown
# TODO.md
- [x] User authentication
- [ ] API documentation
- [ ] Rate limiting
```

- Persist across sessions, version-controlled
- User and agent co-edit
- Agent reads on start — knows what's pending

---

## No Background Bash? Use tmux.

For dev servers, watch mode, REPLs:

```bash
tmux new-session -d -s dev "npm run dev"
tmux capture-pane -t dev -p          # peek at output
tmux send-keys -t dev "rs" Enter     # send command
tmux attach -t dev                   # user can watch live
```

Full observability — no hidden processes.

---

## git worktree — isolation

```bash
git worktree add ../feature feature-branch
cd ../feature && [work]
git worktree remove ../feature
```

Experiments, parallel explorations, review→fix — all isolated via filesystem.

---

## Summary

| Need | Pi Way |
|------|--------|
| Sub-agent (one-shot or steerable) | `pisub` (run for one-shot, spawn+send+steer for interactive) |
| Inline one-shot result (no log) | `Agent` tool + agent `.md` files |
| Orchestration | Make — data flows through recipes (lenses) |
| External tool | mcporter (describe first!), CLI + README |
| Planning | `PLAN.md` |
| Task tracking | `TODO.md` |
| Background process | `tmux` |
| Context gathering | Separate session → artifact → fresh session |

---

## See Also

- [Mario Zechner's blog](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
- [Armin Ronacher: Pi within OpenClaw](https://lucumr.pocoo.org/2026/1/31/pi/)
- [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)
- [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents)
- [`pisub` skill](./../pisub/SKILL.md) — live sub-agents via tmux + RPC
