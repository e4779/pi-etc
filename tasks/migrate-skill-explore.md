---
status: done
---

# Delete skill: explore — superseded by personas + native subagent

Verdict OVERTURNED by operator 2026-11-19: DELETE.

The read-only explorer contract already lives at the persona level
(~/.pi/agent/agents/), and the skill's mechanism was fabric-era
(spawn_subsession / yield_to_subsessions — absent on vanilla pi; the
native subagent tool is the door). Bonus: its "Borrowed from ZCode"
line named the work environment in a public-bound repo.

- [x] git rm skills/explore/
- [x] Dir-wide skills glob needs no manifest edit
- [x] tsk check green (pre-commit)
