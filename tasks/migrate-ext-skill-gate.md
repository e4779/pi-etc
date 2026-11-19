---
status: pending
blocked-by: [new-repo-structure.md]
---

# Migrate extension: skill-gate → packages/skill-gate

Verdict: own package `@e4779/skill-gate`. node stdlib only.

- [ ] `git mv extensions/skill-gate packages/skill-gate` + package.json + pi manifest entry
- [ ] Deps move from root package.json to the package
- [ ] Live probe: extension loads
