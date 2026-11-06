---
name: org-tasks
description: "Tasks live inside working org documents (runbooks, logs, specs) - never separate TODO files; agenda views are computed on demand by scripts/agenda (emacs --batch). Use when creating or updating TODOs in org files, computing ready/blocked/deadline views across repos, task dependency graphs (DOT/Mermaid), linting agent-written org, or migrating a legacy TODO.md. Triggers: org-mode, org-agenda, TODO.org, org-id, BLOCKER, org-файл. Not for: emacs configuration, org-roam/zettelkasten, calendar events. RU: задачи в org-файлах, орг-агенда, зависимости задач, граф задач, ранбук с TODO."
---

# org-tasks: tasks inside org documents

A task is a TODO-keyword heading embedded in a real document (runbook, log,
spec). There are no standalone task files. Every view (list, ready, blocked,
deadlines, graph) is computed from the files on demand - the files are the
only source of truth.

## Vocabulary (frozen)

First line of every tracked org file:

    #+TODO: TODO NEXT WAITING SOMEDAY | DONE CANCELLED

| state | meaning |
|---|---|
| TODO | captured, not committed to a sprint |
| NEXT | committed, ready to work (GTD next action) |
| WAITING | parked on someone/something external; say what in the body |
| SOMEDAY | idea without commitment (dream parking lot) |
| DONE / CANCELLED | final states |

BLOCKED is NOT a keyword - it is computed from :BLOCKER: properties. Never
store it.

## Identity and dependencies

- `<id:UUID>` via the `:ID:` property is the stable identifier. Stamp lazily:
  only when the task is referenced from elsewhere. `agenda id <file> <substring>`
  stamps safely.
- Cross-file task links use `[[id:...]]`; dependencies are
  `:BLOCKER: id:<id>` (space-separated for multiple). Path-based
  `file:...::*Heading` links are for documents, not tasks - they rot on rename.

## Writing rules (org is strict; violations are silent)

1. `:PROPERTIES:` drawer goes immediately after the heading line, prose after
   the drawer. Misplaced drawers are silently ignored by org.
2. Only declared keywords are states. An undeclared `WAITING` is plain text,
   invisible to every view. `agenda lint` catches it.
3. One paragraph = one line. No hard wrapping.
4. Tags match `^[A-Za-z0-9_@]+` - no hyphens. `freebsd-nct` cannot be a tag;
   use `freebsd_nct` or a property.
5. Heading-echo guard: edits to a heading line must match the full old line.
   Never target by line number alone.

## Discovery

`git ls-files '*.org'` from the repo root. Repositories are the curation
unit; every tracked org file participates. Never create standalone TODO.org or
task-list files - migrate legacy ones instead
(references/playbook-todo-md.md).

## CLI

`scripts/agenda`: native org views render through `emacs --batch`
(org-agenda-list, org-todo-list, org-id stamping); text views are POSIX awk
over the plain files. Run from the repo root (or set AGENDA_ROOT):

    agenda agenda                 # native org-agenda-list (week, deadlines)
    agenda todos                  # native org-todo-list (all keywords)
    agenda list [STATE]           # rg over tracked files
    agenda ready                  # NEXT entries with no unresolved blockers
    agenda blocked                # entries whose blockers are unresolved
    agenda graph                  # dependency graph as DOT
    agenda id FILE SUBSTRING      # stamp :ID: on a heading, print it
    agenda lint                   # vocab, drawer placement, dangling blockers

Cross-repo views: `AGENDA_ROOTS=repo1:repo2 agenda <cmd>` or `agenda -R`
(roots from `~/.config/org-agenda/roots`, one per line, `#` comments; override
with AGENDA_ROOTS_FILE). Files are unioned across roots as absolute paths;
id-blockers resolve across repos; `agenda id` with a relative FILE requires
it to exist in exactly one root.

Views are reactive: nothing is cached, every call re-reads the files.
The only persistent cache is org-id-locations.

## Elisp gate

Любое изменение `scripts/*.el` проходит `elisp-check [--fix] FILE.el`
(parens → canonical indent → byte-compile) до тестов. Гейт — часть
определения готовности: красный гейт = код не существует.

## Limits

- Batch mode assumes no interactive Emacs session owns these files. If one
  appears with unsaved buffers over the same repo, computed views can lie:
  keep buffers saved, or switch the wrapper to emacsclient mode (falsifier).
- LOGBOOK state-change history and org-edna triggers do not fire in batch;
  CLOSED stamping and blocker computation are done explicitly by agenda.el.

## References

- references/conventions.md - vocabulary rationale, state lifecycle, examples
- references/gotchas.md - org strictness receipts (what silently fails)
- references/graph.md - graph output, org-edna notes
- references/playbook-todo-md.md - one-time TODO.md deprecation steps
