---
status: pending
---

# Orchestration nuggets → system AGENTS.md

## Objective

Operator stopped using fabric, but fabric-orchestration carried
surviving-value patterns worth a system-level home (~/.pi/agent/
AGENTS.md — the global layer, managed via dot-pi). Distill LATER
("потом, не сейчас"), not now.

## Candidate nuggets (from the deleted skill + session history)

- **Non-blocking agent calls**: async spawn, parent keeps working,
  native wake on completion — the fabric pattern predates pi's native
  async subagents; reconcile with the native `subagent` tool's async
  mode and keep only what the native surface lacks.
- **Verifier contracts**: fresh-context verifier returns strict JSON
  {passed, reason, nextAction}; workers never declare victory.
- **Decomposition shapes**: direct work vs bounded agents vs recursive
  decomposition vs workflow phases — when each.
- One writer per cwd/worktree; isolate concurrent writers.

## Notes

- Source material: git history (fabric-orchestration deleted
  2026-11-19) and session memory.
- Target is dot-pi territory: keep pi-etc out of machine specifics.

- [ ] Distill + reconcile against the native subagent surface
- [ ] Land the surviving lines in system AGENTS.md (via dot-pi)
