---
status: pending
---

# Deprecate pi-web-plugins — remove the dead experiment

## Objective

Remove `pi-web-plugins/` from the repository. Operator ruling 2026-11-17:
a joke experiment, unused for a long time; kept until now only as a
historical artifact — git history preserves it, nothing else must.

The vendored bundle (~7.4 MB: `mermaid.min.js` 3.5 MB +
`viewer-static.min.js` 3.8 MB) was ruled a packaging mistake anyway:
dependencies should have been rebuilt at publish time, never committed.

## Checklist

- [ ] Grep the repo for references to `pi-web-plugins` (docs, README,
      scripts, gate) — remove or update each.
- [ ] `git rm -r pi-web-plugins/` (history keeps the artifact reachable).
- [ ] Gate green (`sh tools/gate.sh`), skills lint untouched.
- [ ] NOTE for the umbrella refit card: the directory must not survive
      into `packages/` — it is excluded from the umbrella by the same
      ruling.

## Context (baked)

- Ruling trail: session 2026-11-17 (b/). Sanitize of the same repo landed
  first (`docs(sanitize)` commit, history rewritten twice); this card is
  the first tsk card in pi-etc — dogfood lane for the tsk package.
