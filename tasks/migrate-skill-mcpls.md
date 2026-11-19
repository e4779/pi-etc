---
status: pending
blocked-by: [new-repo-structure.md]
---

# Migrate skill: mcpls → packages/skills

Verdict: moves to `@e4779/skills` as-is. Coupled to mcporter/mcpls stack; keep, README notes the dependency.

- [ ] `git mv skills/{name} packages/skills/{name}` + skills-package manifest covers it
- [ ] Relative links (../mindmap etc.) stay green
- [ ] Gate green
