---
status: pending
blocked-by: [new-repo-structure.md]
---

# Migrate skill: fabric-orchestration → packages/skills

Verdict: moves to `@e4779/skills` as-is. Ruled 2026-11-19: plain skill, keep as-is (fabric-contour delegation patterns).

- [ ] `git mv skills/{name} packages/skills/{name}` + skills-package manifest covers it
- [ ] Relative links (../mindmap etc.) stay green
- [ ] Gate green
