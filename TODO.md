# TODO.md — pi-etc

> Execution companion to per-skill docs and the tools/ source.
> Order = priority: the first open item is the next thing to work on.

---

## Open work

### Track D — upstream: SessionManager.open() silently truncates non-session files (earendil-works/pi#6002)

Filed 2026-06-23; auto-closed `not_planned` on submission (expected for new
contributors per CONTRIBUTING — maintainers review daily and reopen worthwhile
reports). Root cause + repro live in `docs/upstream-issue-draft.md`; local
mitigations (content detector + `.bak` backup) are in `tools/pi-session.ts`.

- [ ] Watch for maintainer triage; if reopened → add the AI-assistance
      disclosure comment per CONTRIBUTING

---

## Removed 2026-09-03 — pi-way, pisub, rlm-way, deepthink (+ bin/tot-*)

All superseded by pi-fabric (`fabric_exec` + agent-runtime + `/skill:fabric-rlm`):

- **pi-way** — the principle folded into the fabric-first workflow
- **pisub** (+ `tools/pisub.ts`) — sub-agents via tmux+RPC → fabric one-shot/
  resident agents (recursion happens from code)
- **rlm-way** (+ `@runtimed/node` dep) — persistent-Python REPL; fabric
  emulates cross-turn state via mesh-bindings, enough for current work
- **deepthink** (+ `bin/tot-*`) — never used once

History: `git log`, tag `pre-fabric-cleanup`.

---

## Hygiene

- An item earns a place here only when it survives a single session.
  Session-scoped steps live in TaskCreate, not here.
- **Delete done items** — history lives in `git log`, not here. Done items
  break the 30-second scan.
- Keep under ~80 lines of open items.
