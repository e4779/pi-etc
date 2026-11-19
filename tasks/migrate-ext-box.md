---
status: pending
---

# Migrate extension: box → packages/box

Verdict: own package `@e4779/box`. typebox peer only.

- [ ] `git mv extensions/box packages/box` + package.json + pi manifest entry
- [ ] Deps move from root package.json to the package
- [ ] Live probe: extension loads
