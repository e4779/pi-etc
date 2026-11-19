---
status: pending
blocked-by: [umbrella-refit-workspaces.md]
---

# Absorb pi-fresh into docs/ — freeze the repo

## Objective

Preserve the pi-fresh decision history inside the umbrella and freeze
the standalone repo. pi-fresh was the "harness on vanilla pi" hub: plan,
notes, contour decisions 2026-11. Its satellites (pi-sh-prose →
shell-lab, pi-recall → pi-fabric) already live elsewhere; only the notes
matter now.

## Checklist

- [ ] LEAK AUDIT FIRST (non-negotiable): pi-fresh AGENTS.md/PLAN.md
      mention machines (hlab) — run the same scan pi-etc got
      (work email, LAN proxy IP, hlab/thinkpad) on the whole pi-fresh
      history. Sanitize before anything merges into the public umbrella.
- [ ] fREW merge recipe, history preserved: `git fetch
      ~/projects/pi-fresh` → branch → rearrange files under `docs/`
      → `git merge`.
- [ ] pi-fresh repo README gets a frozen-mirror note pointing at
      pi-etc/docs/.
- [ ] tsk check green; gate green.

## Context (baked)

- Operator rule: notes/history may enter the public umbrella only after
  the audit — the umbrella inherits every leak its absorbed repos carry.
