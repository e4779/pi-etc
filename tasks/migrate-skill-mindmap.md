---
status: pending
blocked-by: [new-repo-structure.md]
---

# Migrate skill: mindmap → packages/skills

Verdict: moves to `@e4779/skills` as-is. References shared with drawio skill — move together, keep relative links green.

- [ ] `git mv skills/{name} packages/skills/{name}` + skills-package manifest covers it
- [ ] Relative links (../mindmap etc.) stay green
- [ ] Gate green
