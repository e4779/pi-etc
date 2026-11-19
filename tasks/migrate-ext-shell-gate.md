---
status: pending
blocked-by: [new-repo-structure.md]
---

# Migrate extension: shell-gate → packages/shell-gate

Verdict: own package `@e4779/shell-gate`. Crown jewel; deps: shellcheck-wasm moves with it.

- [ ] `git mv extensions/shell-gate packages/shell-gate` + package.json + pi manifest entry
- [ ] Deps move from root package.json to the package
- [ ] Live probe: extension loads
