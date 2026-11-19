---
status: done
---

# Delete extension: inject-default-skills

Verdict OVERTURNED by operator 2026-11-19: DELETE — it burns tokens (injects default skills into every session, costing context for no live use).

- [ ] `git mv extensions/inject-default-skills packages/inject-default-skills` + package.json + pi manifest entry
- [ ] Deps move from root package.json to the package
- [ ] Live probe: extension loads
