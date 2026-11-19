---
status: done
---

# Migrate extension: shell-gate → packages/shell-gate

Verdict: own package `@e4779/shell-gate`. Crown jewel; deps: shellcheck-wasm moves with it.

- [x] `git mv extensions/shell-gate packages/shell-gate` + package.json + pi manifest entry
- [x] Deps move from root package.json to the package
- [x] Live probe: extension loads

## Done notes (2026-11-19)

Root `pi.extensions` entry repointed to ./packages/shell-gate/index.ts —
the git-source install keeps working mid-migration. shellcheck-wasm
stays in root deps until workspaces (module resolution walks up from
packages/); the closing card drops it. Import probe green from the new
path.
