---
status: pending
blocked-by: [new-repo-structure.md]
---

# Publish npm packages — @e4779/skills + per-extension packages

Scope ruled 2026-11-19: grab-bag model for skills (@e4779/skills,
mitsupi-style disclaimer), one package per extension. Manual publish
first (`npm publish -w packages/<name>`); OIDC only if repo moves to
GitHub. Ship when the core migrations land — the personal tail may
follow later.

- [ ] npm whoami = e4779 scope owner; publishConfig.access public per package
- [ ] Repo public on gitverse (history sanitized, verified 2026-11-17)
- [ ] Publish skills package first, then extensions (shell-gate first)
- [ ] Machines: settings.json git-source → npm sources; thinkpad later
      (needs re-clone after rewrite regardless)
- [ ] README per package: one line, rsc style
