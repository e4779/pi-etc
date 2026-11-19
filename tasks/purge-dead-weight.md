---
status: done
---

# Purge dead weight at source

Verdicts already final (settings.json minus-lists die with this card):

- [x] extensions/lint-check — delete
- [x] extensions/co-author — delete (never in manifest; carried the work-hub domain into the tree — see below)
- [x] extensions/lib — delete (imported only by dead qwen)
- [x] extensions/qwen — delete
- [x] extensions/context-guard — delete
- [x] skills/pi-session — delete
- [x] themes/ — delete if empty (manifest entry too)
- [x] settings.json on machines: drop the minus-filters afterwards

## Done notes (2026-11-19)

extensions/ emptied completely. co-author (never loaded) carried
model@work-hub.example — a work-hub domain the first sanitize pass missed
(different string than sbertech/ermakov); history re-scrubbed in the
same session (second filter-branch pass, work-hub.example → <work-hub>).
Manifest now lists only packages/shell-gate + packages/whoami.
