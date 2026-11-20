---
status: done
blocked-by: [extract-pi-recall.md, migrate-ext-box.md, migrate-ext-inject-default-skills.md, migrate-ext-llm.md, migrate-ext-shell-gate.md, migrate-ext-skill-gate.md, migrate-ext-whoami.md, migrate-skill-box.md, migrate-skill-chrome-devtools.md, migrate-skill-drawio.md, migrate-skill-explore.md, migrate-skill-fabric-memory.md, migrate-skill-fabric-orchestration.md, migrate-skill-gh-cli.md, migrate-skill-github.md, migrate-skill-grill.md, migrate-skill-layout-check.md, migrate-skill-mcpls.md, migrate-skill-mcporter.md, migrate-skill-mindmap.md, migrate-skill-opensource-contribution.md, migrate-skill-shell-taste.md, migrate-skill-skill-author.md, migrate-skill-sobesednik.md, migrate-skill-zai-mc.md, purge-dead-weight.md]
---

# Close the repo structure — root workspaces, teardown, verify

## Objective

CLOSING card, ruled 2026-11-19: the item cards grow `packages/`
incrementally (each `git mv` + its own package.json + manifest entry —
no big-bang branch); this one assembles the whole only after the last
item moved. Unlocks publish.

## Checklist

- [x] Root package.json: private:true, workspaces ["packages/*","apps/*"],
      never published; old root-level `pi` manifest entries removed.
- [x] `tools/gate.sh` + `lint:skills` paths under workspaces; `tsk check .`
      folded into the gate.
- [x] Dead refs gone: old skills/, extensions/, themes/ dirs empty/removed
      (purge card's leftovers swept here if any).
- [x] Verify probes: `pi -e ./packages/skills`, `pi -e ./packages/shell-gate`
      in a live session.
- [x] Clone topology doctrine holds (canonical=~/projects/pi-etc).

## Rulings baked

See the item cards — every verdict lives where it was decided. Fabric
pair keeps, grill is an independent implementation, sobesednik publishes,
dead weight purges, pi-recall extracts from the fork, one package per
extension, skills package named @e4779/skills.

## Done notes (2026-11-20)

Root: private:true + workspaces [packages/*, apps/*]; npm install
hoists all five packages; extensions resolve from the workspace.
themes/ entry died with its dir. Live -e probes: shell-gate and
skills packages each loaded a session and answered (mechanical
one-word probes). The root pi manifest STAYS until the publish wave
switches machines to npm sources — it is the git-source install
surface; its teardown rides with the switch, not before.
