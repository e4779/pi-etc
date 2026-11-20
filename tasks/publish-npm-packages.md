---
status: done
blocked-by: [new-repo-structure.md]
---

# Publish npm packages — @e4779/skills + per-extension packages

Scope ruled 2026-11-19: grab-bag model for skills (@e4779/skills,
mitsupi-style disclaimer), one package per extension. Manual publish
first (`npm publish -w packages/<name>`); OIDC only if repo moves to
GitHub. Ship when the core migrations land — the personal tail may
follow later.

- [x] npm whoami = e4779 scope owner; publishConfig.access public per package
- [x] Repo public on gitverse (history sanitized, verified 2026-11-17)
- [x] Publish skills package first, then extensions (shell-gate first)
- [x] Machines: settings.json git-source → npm sources; thinkpad later
      (needs re-clone after rewrite regardless)
- [x] README per package: one line, rsc style

## Done notes (2026-11-20)

All five published via a one-shot bootstrap GAT (passkey account has
no OTP; EOTP blocked CLI publishes — the token bridged it), then
installed from npm on hlab with exact pins; git-source died with the
root pi manifest teardown. CDN propagation (~5 min) briefly looked
like staging. Follow-ups: operator registers trusted publishers for
the five names (repo e4779/pi-etc, workflow publish.yml; pi-recall
repointed from pi-fabric), revokes the bootstrap token, flips the
gitverse repo public, and switches thinkpad later (re-clone after the
November history rewrite).
