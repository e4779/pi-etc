---
status: pending
---

# Umbrella refit — pi-etc becomes the workspaces root

## Objective

Turn pi-etc into the umbrella over all pi-projects: one repo, npm
workspaces, `packages/pi` as the publishable pi-package, `apps/` for
tools, `docs/` for history. Et Cetera returns to its founding intent.

Ruling 2026-11-17: fewer repos to hop between; the shared thing is
tooling and peer-deps, which is enough to justify a personal monorepo.
Precedents studied: rsc/cmd (one repo, nothing shared but the author),
fREW leatherman (shared CI), web-infra-dev (org of per-product monorepos
— their split reasons do not apply at solo scale). Range: pi-projects
ONLY. pi-fabric (foreign tree), reference clones, homelab/driver domains
stay out.

## Target shape

```
pi-etc/
├── package.json        # private:true, workspaces ["packages/*","apps/*"], never published
├── packages/
│   └── pi/             # @e4779/pi-etc — extensions/ skills/ themes/, mitsupi-shape
├── apps/               # future: riff (own card)
├── docs/               # pi-fresh lands here (own card)
└── tools/              # gate.sh, hooks — repo furniture, outside packages
```

## Checklist

- [ ] Clone topology doctrine (ruling 2026-11-19): `~/projects/pi-etc` is
      the CANONICAL working clone; `~/.pi/agent/git/...` is pi's install
      target (node_modules-equivalent) — hands-off, reconciled only by
      `pi update --extensions`. All edits go: canonical → push →
      reconcile.
- [ ] Branch `umbrella`; root package.json → private + workspaces; move
      `extensions/ skills/ themes/` into `packages/pi/`; keep the `pi`
      manifest and `pi-package` keyword; one `npm install` at root.
- [ ] Kill the minus-listed dead weight AT SOURCE: `extensions/lint-check`,
      `extensions/qwen`, `extensions/context-guard`, `skills/pi-session`
      — each gets a verdict (delete or revive), then the settings.json
      minus-filters on machines can die.
- [ ] `tools/gate.sh` + `lint:skills` under workspaces (paths change).
- [ ] Fold `tsk check .` into the gate (natural moment — gate is being
      reworked anyway).
- [ ] Verify: `pi -e ./packages/pi` in a live session — skills visible,
      shell-gate fires, box skill intact.
- [ ] Merge to main only after the verify probe.

## Context (baked)

- pi-etc is ALREADY a valid pi package (pi manifest, installed today as
  git source) — the refit moves it, not reinvents it.
- History was sanitized 2026-11-17 (emails + proxy IP + machine names);
  the refit rides the clean history.
