# TODO.md — pi-etc

> Execution companion to per-skill docs and the tools/ source.
> Order = priority: the first open item is the next thing to work on.

---

## Open work

_(пусто — предложить что-нибудь, если выжило меньше одной сессии, место не здесь)_

---

## Closed 2026-09-03 — upstream #6002: SessionManager.open() truncation

Fixed & closed upstream (accepted our report from `docs/upstream-issue-draft.md`).
Local mitigations stay in `tools/pi-session.ts` (content detector + `.bak`).

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
