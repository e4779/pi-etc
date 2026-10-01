---
name: fabric-orchestration
description: >
  Choose the orchestration shape before you run: direct work, bounded agents,
  recursive decomposition, or workflow phases. Includes the async subagent
  pattern (agents.spawn/wait/status inbox) and verifier contracts.
---

References are relative to /home/e4779/.pi/agent/git/gitverse.ru/e4779/pi-etc/skills/fabric-orchestration.

# Decision tree (measure, don't feel)

1. Fits one context (small `fd | wc -l`, single phase) → work directly. No orchestration.
2. Independent bounded items (many files/URLs/checks, each small) → in-program fan-out:
   `agents.run` batches via `Promise.all` (≤5 concurrent), each worker returns ≤1KB; label every worker.
3. Corpus itself oversized (>100 files / >10MB / whole-repo — the AGENTS.md gate) → `/skill:fabric-rlm`
   recursive decomposition: orient → non-overlapping partitions → combine. Not a judgment call.
4. Multi-phase with dependencies → `/skill:fabric-workflow`: code-held phases, pipelines, budgets.
5. Verdicts, not vibes: every fan-out ends with a separate verifier step — strict JSON
   `{passed, reason, nextAction}`, evidence only (files/commands/tests). Workers never grade
   their own homework; in doubt → passed:false.

# Async children: agents.spawn is the default for parallel work

`agents.spawn({ task, name?, model?, cwd?, worktree?, schema? })` returns a handle immediately;
the child runs detached while Main stays responsive (dashboard shows it).

- Results arrive via the **completion inbox**: batched into Main's context right after the
  current tool batch (even mid-turn), or they wake idle Main once. No polling.
- `agents.wait({ id })` joins and **acknowledges** the result (`agents.join` is an alias);
  `agents.status({ id })` peeks without acking; `agents.stop({ id })` cancels.
  Prefer `wait` over status loops; return the outcome to Main when it must reason about it.
- `schema` on the request makes the child return validated structured data in `result.value`.
- `cwd`/`worktree` partition edit ownership between concurrent children.
- A terminal run can still report incomplete work — inspect the result; spawn ≠ success.

Session-level children (need turn semantics or a readable transcript) stay on the harness:
`spawn_subsession` + `yield_to_subsessions` at joins. Synchronous `agents.run` is fine for
one bounded worker whose result the very next line needs.

In-program structured fan-out (phases, dashboards, budgets): `workflow.agent/parallel/pipeline`
with `workflow.configure/phase/log` — see /skill:fabric-workflow.

# Between calls

- Values that must survive: `mesh.put({ key, value })` under a namespace (`<label>/...` or
  `rlm/<rootId>/bindings/...`); pass keys, not values; clean up when done; no secrets, no TTL.
- Full child output → disk/mesh; the orchestrator sees a ≤1KB digest only.
- Model for a child: `agents.models({ runner: "pi" })` keys verbatim, or configured aliases;
  do not reconstruct model ids from display names.
- Bare inference without tools/session: `extensions.llm({ prompt, system?, model?, maxTokens? })`
  — map/reduce over chunks you already hold.

# Verifier contract

Every fan-out ends with a separate verifier step — strict JSON `{passed, reason, nextAction}`,
evidence only (files/commands/tests). Workers never grade their own homework; in doubt → passed:false.
Give the verifier its own tools (read/bash) and the charter (mesh key or inline) so it re-derives
evidence instead of trusting the author's report.

# Pointers

- Heavy playbooks: /skill:fabric-workflow (phases, pipelines, budgets), /skill:fabric-rlm
  (recursive context decomposition) — pi-fabric skillsets, explicit invocation by design.
- API reference: pi-fabric skillsets/typescript/fabric-exec/references/agents.md (+ docs/agents.md
  for inbox/ack semantics).
- Command-level recipes: bun-runtime skill → REFERENCE.md.
