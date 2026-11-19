---
status: pending
blocked-by: [new-repo-structure.md]
---

# Migrate skill: box → packages/skills

Verdict: moves to `@e4779/skills` as-is. Live via box_list/box_exec natives. Needs the distrobox host.

- [ ] `git mv skills/{name} packages/skills/{name}` + skills-package manifest covers it
- [ ] Relative links (../mindmap etc.) stay green
- [ ] Gate green
