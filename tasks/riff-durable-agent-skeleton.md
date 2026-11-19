---
status: pending
blocked-by: [new-repo-structure.md]
---

# riff — durable-agent skeleton on local llama.cpp

## Objective

First app of the umbrella: a personal console coding agent on
pi-durable, no pi-harness, talking to the operator's live llama-server.
Package `@e4779/riff`, bin `riff`. The name is the architecture: chord
is their runtime, riff is our improvisation over it.

Ruling 2026-11-17: NOT a revival of durable-homelab (stays frozen as the
pi-durable 1.0.0 reference); NOT on p2/p3 (upstream owns the web lane);
this is the console/local-models niche. Scope for the skeleton = upstream
example 25 plus prompt and provider; shell-prose layers are explicitly
OUT of v0.

## Checklist

- [ ] Workspace `apps/riff`: `package.json` (bin riff, EXACT pin
      `@earendil-works/pi-durable@1.5.2` — no `^`: pi.tool v4 /
      pi.generation v3 mean a float can break the SQLite store),
      `@earendil-works/pi-ai` pinned likewise.
- [ ] Prompt extension: `~/.pi/agent/AGENTS.md` (global) + AGENTS.md
      walk-up from conversation cwd (pattern: p2 `plugins/prompt/
      context-files.ts`). pi-durable ships NO AGENTS.md machinery —
      the loader is ours (verified against upstream 2026-11-17).
- [ ] llama.cpp provider: pi-ai compat (`@earendil-works/pi-ai/compat`,
      `stream`) against the running single-model llama-server first;
      router statuses (loaded/sleeping/unloaded, copy of upstream
      `extensions/llama/client.ts`, MIT) deferred behind a follow-up.
- [ ] Model selection: `models.setProvider()` + per-conversation
      `agent.model`; mid-session switch via `conversation.configure()`.
- [ ] Storage `~/.pi/riff/` (p2/p3 family precedent); conversation cwd
      = launch dir.
- [ ] Console loop: submit + transcript tail. Nothing else in v0.
- [ ] Verify (live): real session on the operator's llama-server, real
      cwd, CodingTools read/write/bash round-trip, crash-kill resume
      (SQLite reopen picks up mid-turn).

## Context (baked)

- Blueprints: upstream `packages/durable/test/examples/25-coding-agent.ts`
  (canonical skeleton) and `daya0576/pi-imessage` (smallest real agent
  wiring). AGENTS.md loading + llama provider are coding-agent
  extensions, NOT library features — copy patterns, not imports.
- API culture warning stands: "changes without notice" — every dep
  exact-pinned, upgrades deliberate.
