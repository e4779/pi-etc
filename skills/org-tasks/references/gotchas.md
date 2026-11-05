# gotchas (verified receipts)

Each item below bit us in practice; treat them as tests the agent must pass.

## Undeclared keywords are invisible

`** WAITING Review` with WAITING absent from `#+TODO:` produces no state at
all: org-get-todo-state returns nil, every view skips it. Verified: demo file
with 5 headings showed 4 entries until keywords were declared. Receipt: the
2026-11-05 agenda demo on labhost.

## Property drawer placement

A `:PROPERTIES:` drawer must directly follow the heading line. Prose first,
drawer second = org silently ignores every property in it (our BLOCKER demo
printed nothing until the drawer moved up). rg will never catch this; lint
does. Receipt: same demo, BLOCKED line absent then present after the move.

## Do not inline elisp into --eval

Quoting hell: a --eval one-liner with format strings died with "End of file
during parsing" on a stray paren. Always put elisp in a file and use
`emacs --batch -l file.el`. Receipt: agenda demo, first attempt.

## pos/line numbers rot

Byte positions and line numbers drift on every edit above them. colonelpanic8's
skill documents pos instability; yuanw's aborts writes unless the heading still
matches. Rule: locate by id, edit by full-line match, never store positions.

## Tag charset

Org tags cannot contain hyphens. `freebsd-nct` as a tag breaks; use
`freebsd_nct` or a property. Receipt: szaffarano org-update-todo skill
documents the same regex.

## org-id-locations

The id->file index is a cache (default ~/.emacs.d/.org-id-locations). In a
fresh HOME the write fails ("Opening output file: No such file or directory")
until the directory exists. Stale index = broken id resolution; agenda.el
rebuilds it on every id-dependent call.

## org-map-entries sees only declared states

Same root cause as undeclared keywords: filters like NEXT operate on
org-todo-keywords-1 of each file. A file missing the #+TODO line silently
drops out of state-based views. vocab lists per-file declarations; lint flags
files without one.

## Batch vs live divergence

If an interactive Emacs keeps unsaved buffers over the same files, batch views
read the disk and lie. Single-owner rule: batch-only, or saved buffers, or
switch to emacsclient. See Limits in SKILL.md.
