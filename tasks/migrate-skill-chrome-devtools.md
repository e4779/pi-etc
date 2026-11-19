---
status: pending
blocked-by: [new-repo-structure.md]
---

# Migrate skill: chrome-devtools → packages/skills

Verdict: moves to `@e4779/skills` as-is. Coupled to the chrome-devtools MCP + WSL launch scripts; sanitize already genericized proxy refs.

- [ ] `git mv skills/{name} packages/skills/{name}` + skills-package manifest covers it
- [ ] Relative links (../mindmap etc.) stay green
- [ ] Gate green
