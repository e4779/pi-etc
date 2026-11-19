---
status: done
---

# Migrate extension: whoami → packages/whoami

Verdict: own package `@e4779/whoami`. No imports beyond the extension API.

- [x] `git mv extensions/whoami packages/whoami` + package.json + pi manifest entry
- [x] Deps move from root package.json to the package
- [x] Live probe: extension loads
