---
status: done
---

# Delete llm extension — used only incidentally

Verdict OVERTURNED by operator 2026-11-19: DELETE — «ты использовал
только случайно»; the bare-completion tool never became a real
workflow (fabric_exec map/reduce era artifact, 2026-09-18).

If a bare-completion primitive is ever needed again, it returns as its
own package with an actual use case.

- [x] git rm extensions/llm/
- [x] Root pi.extensions entry removed
- [x] tsk check green (pre-commit)
