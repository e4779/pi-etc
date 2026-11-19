---
status: pending
---

# Migrate extension: whoami → packages/whoami

Verdict: own package `@e4779/whoami`. No imports beyond the extension API.

- [ ] `git mv extensions/whoami packages/whoami` + package.json + pi manifest entry
- [ ] Deps move from root package.json to the package
- [ ] Live probe: extension loads
