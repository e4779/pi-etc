---
name: skill-author
description: "Authoring and validating pi skills (SKILL.md). Use when creating, editing, or debugging a skill — covers frontmatter rules, required fields, YAML pitfalls, and the skills-ref validator. Triggers: create skill, new skill, SKILL.md, skill validation, frontmatter error, Nested mappings not allowed. RU: создать скилл, новый SKILL.md, ошибка frontmatter, валидация скилла, nested mappings."
---

# skill-author: creating and validating pi skills

## The contract

A pi skill is a directory containing `SKILL.md` with YAML frontmatter:

```yaml
---
name: my-skill-name          # required, kebab-case, matches dir name
description: <text>          # required, what the skill does + when to trigger
---
```

Followed by markdown body — the instructions pi injects when the skill is loaded.

## Frontmatter rules

### `name` (required)

- kebab-case, must match the directory name
- Example: dir `skill-author/` → `name: skill-author`

### `description` (required)

- Free text describing what the skill does and when to use it
- **MUST be quoted** if it contains any of these YAML-breaking characters:
  - `: ` (colon + space) — YAML reads as a nested mapping entry
  - Leading/trailing spaces
  - `#` (YAML comment)
  - `{`, `}`, `[`, `]` at the start
  - `&`, `*`, `!`, `|`, `>`, `%`, `@`, `` ` ``

```yaml
# ❌ Breaks — ": " after (view-права) is read as nested mapping
description: Runbook приведения страницы (view-права): находим расхождения

# ✅ Correct — quoted
description: "Runbook приведения страницы (view-права): находим расхождения"
```

The most common error: `Nested mappings are not allowed in compact mappings at line 2, column 14`. This almost always means an unquoted `: ` in `description`.

## Validation

**Always validate before committing.** `skills-ref` is installed globally:

```bash
# Single skill
skills-ref validate path/to/SKILL.md

# All skills in pi-etc
cd ~/dev/pi-etc && npm run lint:skills
```

`skills-ref` checks:
1. Valid YAML in frontmatter (catches unquoted `: `, bad indentation)
2. Required fields present (`name`, `description`)

Exit 0 = valid. Any other exit = read the error, fix, re-validate.

## Creating a new skill

1. Create directory: `skills/<name>/SKILL.md` (name = kebab-case)
2. Write frontmatter with `name` + `description` (quote if needed)
3. Write the skill body — instructions, triggers, examples
4. Validate: `skills-ref validate skills/<name>/SKILL.md`
5. If in pi-etc: `npm run lint:skills` to check all skills together
6. Commit

## Common errors & fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Nested mappings are not allowed in compact mappings` | Unquoted `: ` in `description` | Wrap `description` value in double quotes |
| `bad indentation of a mapping entry` | Same — YAML sees `key: value: more` | Quote the value |
| `Missing required field in frontmatter: name` | No `name:` line | Add `name: <dir-name>` |
| `Missing required field in frontmatter: description` | No `description:` line | Add `description: "..."` |

## In pi-etc

`npm run lint:skills` runs `skills-ref validate` on every `skills/*/SKILL.md`. This is wired into the pre-commit hook (`tools/install-hooks.mjs` installs `.git/hooks/pre-commit` on `npm install`), so invalid skills block commits automatically.
