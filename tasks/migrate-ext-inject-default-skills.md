---
status: pending
blocked-by: [new-repo-structure.md]
---

# Migrate extension: inject-default-skills → packages/inject-default-skills

Verdict: own package `@e4779/inject-default-skills`. node stdlib only.

- [ ] `git mv extensions/inject-default-skills packages/inject-default-skills` + package.json + pi manifest entry
- [ ] Deps move from root package.json to the package
- [ ] Live probe: extension loads
