---
status: pending
---

# Anti-rot pass — replace embedded lists in skills with live commands

## Objective

Generalized from the mcporter incident (its server table named the
github MCP server that no longer exists anywhere): skill bodies carry
mutable FACTS that rot, instead of pointing at the live command that
answers today.

Doctrine already proven elsewhere: dot-pi's "mutable facts live in
commands", the box-skill fix (version numbers → live checks), AGENTS.md
anti-rot.

## Pattern

- Embedded list/table of instances, servers, versions, paths → replace
  with the discovery command (`mcporter list`, `distrobox list`,
  `jq -r '.packages[]' settings.json`, ...)
- Keep static DOCTRINE in the skill (when/why/how); facts → commands
- Exception: truly static facts (a public API's fixed flags) stay

## Known offenders to sweep (initial inventory)

- [ ] mcporter: server table → `mcporter list` + per-server one-liners
- [ ] zai-mc: check for server/URL lists
- [ ] fabric-memory: source lists → `jq memory.sources fabric.json`
- [ ] pi-recall: any baked store paths
- [ ] Sweep the rest of packages/skills for the pattern (grep for
      tables with hostnames/ports/versions)

- [ ] One pass, per-skill commits; tsk check green
