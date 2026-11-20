---
status: done
---

# Extract pi-recall — as a true wrapper over the fabric memory primitives

## The design saga (2026-11-19..20, baked)

- ORIGINAL SIN: the 0.3.x package carried a full COPY of the engine
  (~5 900 lines in src/memory/*) — an implementation mistake against
  the intended architecture ("примитивы в фабрике, recall — обёртка").
  Tom's runtime had a public ./memory export since 2026-09-08, before
  the package was even born.
- Ruled by operator: the copy was «косяк реализации и моё упущение».
  Final shape: primitives stay in @e4779/pi-fabric (the fork, which
  tracks Tom's fabric-runtime); the umbrella package = CLI + extension
  + config layer + skill over them. Fixes flow: fork merge upstream →
  publish runtime → bump the pin here.

## What landed

- packages/pi-recall = @e4779/pi-recall 0.4.0: bin, src/{cli,providers,
  core,verified,config.ts}, extensions/memory.ts, tests, OUR contour
  skill (park-then-slice). Engine imports → "@e4779/pi-fabric/memory".
- Fork commits (e4779/pi-fabric): re-export the standalone-consumer
  surface in the runtime aggregate (18 names + request-limit constants
  + Shard/DigestShard types); wildcard ./memory/* tried and reverted
  (build pipeline rejects it — aggregate is the native pattern).
- Engine drift made visible: the old review-regressions pins (PR #415
  round) fail against the CURRENT runtime engine — the snapshot had
  drifted. Wrapper keeps wrapper-surface pins; engine behavior pins
  live with the engine (fork package forever-green 77/77 + the
  runtime's own 12-file memory suite).

## Verified

- [x] Live probes: recall (ranked hits over the live session index),
      outline (role=user skeleton), --source thinkpad (shared store),
      expand (stale_pointer on a live-written session = integrity
      binding working as designed)
- [x] bun test: 67/67 green
- [ ] npm publish — deferred to the publish wave (needs the fork
      runtime published as 0.132.6-fork.35+ first; dev probe ran via
      a local file symlink)
