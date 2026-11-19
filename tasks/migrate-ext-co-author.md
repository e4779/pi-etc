---
status: done
---

# Migrate extension: co-author → packages/co-author

Verdict: rescued by operator 2026-11-19 («прикольное расширение, я бы
его сохранил и перенес») moments after the extensions/ purge swept it.
Restored from pre-purge commit f5aa3f9 — the sanitized revision (the
work-hub domain was already replaced by placeholders in the same
session's second history scrub).

Standalone (pi extension API + node stdlib only). Identity map lives
outside the repo: ~/.pi/agent/coauthors.json (model.id → {name,email}),
with a fallback derived from model.id.

- [x] Restored from f5aa3f9 into packages/co-author/
- [x] Own package @e4779/co-author + manifest entry
- [x] Import probe green
