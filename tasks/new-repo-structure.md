---
status: pending
---

# New repo structure — workspaces skeleton + card lattice root

## Objective

Rebuild pi-etc as the umbrella: npm workspaces, per-package publishing,
one canonical clone. This card lands the SKELETON only; every item
moves by its own card (migrate-*/extract-*), all blocked by this one.
The old umbrella card dissolved into this lattice.

Target (ruled 2026-11-17…19):

```
pi-etc/
├── package.json        # private:true, workspaces ["packages/*","apps/*"], never published
├── packages/
│   ├── skills/              # @e4779/skills — agent-agnostic skills (pi manifest inside;
│   │                        #   markdown works for Claude Code / Codex too, Mario pi-skills pattern)
│   ├── pi-recall/           # @e4779/pi-recall — extracted from pi-fabric (own card), skill rides with the tool
│   ├── shell-gate/  box/  llm/  whoami/  skill-gate/  inject-default-skills/
│   │                        # one package per extension — all six verified independent (node stdlib / typebox only)
├── apps/                    # riff later (own card)
├── tasks/                   # this lattice
├── docs/  tools/            # repo furniture
```

## Rulings baked (from the planning session)

- Fabric pair (fabric-memory, fabric-orchestration): plain skills, keep
  as-is → packages/skills.
- grill: independent implementation (drawio-mindmap mechanics), NOT a
  grillme copy → keep, optional "inspired by" line.
- sobesednik: harmless persona cards → publish.
- Dead weight (lint-check, qwen, context-guard, skills/pi-session,
  themes/): purge card.
- pi-fabric is NOT a submodule: fork lives standalone; only pi-recall
  moves out (extract card).
- npm scope @e4779, manual publish first; OIDC automation only if repo
  moves to GitHub.
- Clone topology: ~/projects/pi-etc canonical; ~/.pi/agent/git/... =
  hands-off install target, reconciled by `pi update --extensions`.

## Checklist

- [ ] Branch `structure`; root package.json (private, workspaces);
      empty package dirs with per-package package.json (name, pi
      manifest where relevant, publishConfig.access public).
- [ ] Purge card may run in the same branch (dead weight first).
- [ ] Gate + lint under workspaces; `tsk check .` folded into gate.
- [ ] Verify: `pi -e ./packages/skills` and `pi -e ./packages/shell-gate`
      load in a live session.
- [ ] Merge to main only after the verify probe; item cards unblock.
