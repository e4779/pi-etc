# pi-etc — agent guide

Personal pi extensions, skills, and themes. See `README.md` for the catalog,
install, and selective-include docs.

## Extensions

### whoami (`extensions/whoami/`)

Injects model identity into the system prompt so models don't misidentify
themselves. Profiles live in `PROFILES` in `index.ts`.

**When adding or editing model profiles: read `extensions/whoami/README.md`
first.** It documents the core rule — write *behavioral* strengths, not
*technical specifications*. Specs (context window, max tokens, param count)
rot when the hosting changes and duplicate `models.json`; behavior
(prompting style, failure modes, unique features) is durable. The README has
a Good-vs-Bad table and the reasoning.

### co-author (`extensions/co-author/`)

Adds `Co-authored-by:` trailer to git commits based on the current model.
Mapping lives in `~/.pi/agent/coauthors.json`, not in this repo.

### lint-check, qwen, box

See their source in `extensions/`. Each extension with non-trivial behavior
has a `README.md` next to its `index.ts` — read it before editing.

## Skills

Skills live in `skills/<name>/SKILL.md`. Validate frontmatter before
committing:

```bash
npm run lint:skills
```

This checks every `skills/*/SKILL.md` with `skills-ref validate` and is
wired into pre-commit via `tools/install-hooks.mjs`.

## Development

```bash
npm install          # installs deps + pre-commit hook
npx tsc --noEmit     # type-check
npm run lint:skills  # validate all SKILL.md frontmatter
```

Build a single extension to verify it compiles:

```bash
bun build extensions/whoami/index.ts --no-bundle
```
