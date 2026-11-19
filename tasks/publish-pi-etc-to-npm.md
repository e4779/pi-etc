---
status: pending
blocked-by: [umbrella-refit-workspaces.md]
---

# Publish @e4779/pi-etc to npm — kill the git-sync workflow

## Objective

Version the pi-package properly and install it on machines from the npm
registry, the way pi packages are meant to ship. Manual git-sync across
machines dies with this card. Precedents: Armin publishes the same shape
as npm `mitsupi` (v1.6.0); our own `@e4779/pi-recall` is on npm already.

## Checklist

- [ ] `packages/pi/package.json`: add `repository` (public gitverse URL),
      unify `author` (e41q vs e4779 — pick one), bump to `0.2.0`,
      README one-liner in rsc style.
- [ ] Repo goes public on gitverse (operator button; history already
      sanitized: zero matches for proxy IP / machine names / work email
      across all commits, content and messages — verified 2026-11-17).
- [ ] `npm publish` from `packages/pi` → `@e4779/pi-etc@0.2.0`
      (operator npm login).
- [ ] hlab: settings.json git-source → `npm:@e4779/pi-etc@0.2.0`;
      drop the minus-filters if the source-cleanup landed in the refit.
- [ ] Restart a session: skills load, shell-gate fires; `pi list` shows
      the npm source.
- [ ] thinkpad: same switch when physically at that machine (also needs
      the re-clone after the history rewrite).

## Context (baked)

- pi install semantics researched 2026-11-17: npm source = pinned
  version; registry unreachable → warn, skip, keep running; changelog
  display comes free.
- Do NOT float versions while pi-durable-style breakage culture is on
  the table for the apps lane — pins everywhere.
