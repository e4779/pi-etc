---
name: fabric-orchestration
description: "Decision tree for orchestrating work inside fabric_exec: direct work vs parallel fan-out vs recursive decomposition; verifier contracts; mesh bindings between phases. Use when a task fans out into bounded workers, when parallel research or multi-phase audits exceed one pass, when material may not fit one context, or when results must survive handoffs between calls. Triggers: большой аудит, декомпозиция задачи, параллельные воркеры, фан-аут, не влезает в контекст, несколько агентов, проверь результат. Deep playbooks: /skill:fabric-workflow, /skill:fabric-rlm."
---

# Fabric orchestration — choose the shape before you run

## Decision tree (measure, don't feel)
1. Fits one context (small `fd | wc -l`, single phase) → work directly. No orchestration.
2. Independent bounded items (many files/URLs/checks, each small) → fan-out: `agents.run` batches
   via `Promise.all` (≤5 concurrent), each worker returns ≤1KB; label every worker for the dashboard.
3. Corpus itself oversized (>100 files / >10MB / whole-repo — the AGENTS.md gate) → `/skill:fabric-rlm`
   recursive decomposition: orient → non-overlapping partitions → combine. Not a judgment call.
4. Multi-phase with dependencies → `/skill:fabric-workflow`: code-held phases, pipelines, budgets.
5. Verdicts, not vibes: every fan-out ends with a separate verifier step — strict JSON
   `{passed, reason, nextAction}`, evidence only (files/commands/tests). Workers never grade
   their own homework; in doubt → passed:false.

## Between calls
- Values that must survive: `mesh.put({key, value})` under a namespace (`<label>/...` or
  `rlm/<rootId>/bindings/...`); pass keys, not values; clean up when done; no secrets, no TTL.
- Full child output → disk/mesh; the orchestrator sees a ≤1KB digest only.
- Parallel children: tracked background subsessions + `yield_to_subsessions` at joins — never a
  synchronous multi-minute fan-out inside one tool call (the operator sees nothing for hours).

## Bare inference: extensions.llm
- `extensions.llm({ prompt, system?, model?, maxTokens? })` — one completion, no tools/session.
- Map/reduce over chunks you already hold: `Promise.all(chunks.map(c => extensions.llm({...})))`.
- glm-5.3-flash ignores `reasoning: off` and burns 100–800 invisible reasoning tokens even on
  trivial prompts — default budget 1024 covers it; results return as pi tool-result
  `{ content, text, details }` (read `.text`).

## Pointers
- Heavy playbooks: `/skill:fabric-workflow` (phases, pipelines, budgets), `/skill:fabric-rlm`
  (recursive context decomposition) — pi-fabric skillsets, explicit invocation by design.
- Session-level children: harness `spawn_subsession` (tracked, transcript available) vs in-guest
  `agents.run` (structured value result). Independent research → several children + yield.
