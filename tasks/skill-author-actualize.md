---
status: pending
---

# skill-author actualize — refresh the docs + trace the genealogy

## Objective

The skill was born 2026-09-10 (commit de15ddc, 86 lines, no provenance
line) and much skill-writing knowledge accumulated since. Two jobs:

## 1. Genealogy (investigate)

Operator suspects the skill was TAKEN FROM ZCODE (work environment).
Probe order:
- pi-recall --source zcode, around 2026-09-0x, terms: 'skill author',
  'SKILL.md', 'frontmatter', 'валидация скилла'
- diff the ZCode original vs ours (how much survived?)
- verdict baked here: credit line if substantial borrowing, "inspired
  by" if rewritten, nothing if convergent

## 2. Actualize the content

Known gaps accumulated since September (from session history):
- pi-recall skill conventions (park-then-slice CLI door) — the
  skill-author validator story changed with skills-ref adoption in
  lint:skills gate
- YAML pitfalls learned in the wild (Nested mappings not allowed
  already covered?)
- description-field trigger discipline (RU/EN trigger words pattern)
- the sanitize lessons: machine names/domains never in skill bodies
  (belongs in machine profiles)

- [ ] Genealogy probe + verdict
- [ ] Content refresh against current lint:skills reality
- [ ] skills-ref validator section: current flags and behaviors
