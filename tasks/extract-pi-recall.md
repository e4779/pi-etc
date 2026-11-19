---
status: pending
blocked-by: [new-repo-structure.md]
---

# Extract pi-recall from pi-fabric → packages/pi-recall

Verdict: the source of truth of a published npm tool does not live
inside a foreign-tree fork. Move `packages/pi-recall` (fork) →
`packages/pi-recall` (umbrella); the pi-recall SKILL rides with the
tool (tsk pattern: skills/tsk-workflow inside e4779/tasks).

- [ ] Copy source with history if feasible (fetch + merge recipe), else
      clean copy with provenance note in the package README
- [ ] `npm publish` path green from the new home (version bump,
      publishConfig)
- [ ] pi-fabric: package removed, fork keeps its own taskmd surface
- [ ] Skill card migrate-skill list drops pi-recall (it moved here)
