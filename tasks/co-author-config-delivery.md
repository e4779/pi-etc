---
status: pending
---

# co-author config delivery — how identities reach machines

## Objective

The rescued @e4779/co-author reads its identity map from
`~/.pi/agent/coauthors.json` (model.id → { name, email }), which lives
OUTSIDE the repo. Today no machine is known to have a real map — the
extension loads but resolves nothing until the file exists.

Open question (operator, 2026-11-19): how should the config travel?

## Options to think through

- (a) README instruction only — one manual block per machine,
      copy-paste; zero machinery, zero secrets in the repo. Likely
      default: the file holds personal emails, it must NOT ship.
- (b) dot-pi carries it — the config is machine/profile material;
      dot-pi already distributes per-machine profiles (machines/*),
      and a coauthors.json template or real map could live there for
      HIS machines only (dot-pi is private).
- (c) Env/CLI fallback — extension grows a PI_COAUTHORS env or reads
      a project-local .pi/coauthors.json (project trust applies).

## Constraints baked

- Real emails never enter pi-etc (public): the sanitize saga made the
  boundary explicit.
- Fail-open behavior stays: no map → no trailer, never blocks commits.

- [ ] Pick the delivery model (default lean: (a) README + example
      file `coauthors.example.json` in the package)
- [ ] Implement + document in packages/co-author/README.md
