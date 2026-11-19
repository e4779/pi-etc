---
status: pending
blocked-by: [new-repo-structure.md]
---

# Migrate extension: llm → packages/llm

Verdict: own package `@e4779/llm`. typebox peer only.

- [ ] `git mv extensions/llm packages/llm` + package.json + pi manifest entry
- [ ] Deps move from root package.json to the package
- [ ] Live probe: extension loads
