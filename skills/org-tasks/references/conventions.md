# conventions

## Vocabulary rationale

Four active states, two final ones. This is GTD-lite: Allen's three lists
(next actions / waiting-for / someday-maybe) map onto NEXT / WAITING / SOMEDAY;
TODO is the capture backlog. The vocabulary is deliberately small - people run
wildly incompatible ones (TODO DOING WAIT DEFER, NEXT REVIEW DEPLOY), and
per-file divergence destroys computed views. Freeze it per repo in the
`#+TODO:` line; do not add synonyms.

## State lifecycle

- Capture lands as TODO (first keyword = default for new entries).
- Promote to NEXT only when the task is actually actionable next.
- WAITING must name its waiter in the body ("on review by X", "on upstream fix").
- SOMEDAY is the dream parking lot; review rarely. If the backlog is small
  enough that you never confuse dreams with commitments, SOMEDAY may be
  dropped - decide per repo, once.
- DONE and CANCELLED are final; agenda.el stamps `CLOSED: [ts]` on done
  transitions and removes it on reopen.

## ID lifecycle

Lazy stamping: a task has no :ID: until something references it. The writer of
the first reference stamps the ID (agenda id <file> <substring>) and then links
`[[id:...]]`. IDs are org-id UUID-style strings; any unique string works, but
keep the generated UUIDs. The id->file index (org-id-locations) rebuilds with
`org-id-update-id-locations` - agenda.el does this on every call that needs it.

## BLOCKER semantics

- Value: `id:<id>` entries, space-separated. Only id: form is supported;
  path forms rot.
- A task is blocked iff any blocker points to a non-final state or to an
  unresolvable id. "Blocked" is computed, never stored - one fact, one owner.
- Acyclic by convention: agenda does not currently detect cycles; keep deps
  pointing "later".

## Per-repo AGENTS.md snippet

    # Tasks: TODO-keyword headings inside org documents (see org-tasks skill).
    #+TODO: TODO NEXT WAITING SOMEDAY | DONE CANCELLED
    # Agent writes org canonically: drawer right after heading, one paragraph
    # per line, ids via agenda id. Never create TODO.md / standalone task files.

## Example

    #+TODO: TODO NEXT WAITING SOMEDAY | DONE CANCELLED
    * Runbook: NFS after boot
    ** TODO Triage BADSTATEID stream
       :PROPERTIES:
       :BLOCKER: id:pump-driver-2026
       :END:
       Depends on [[id:pump-driver-2026][pump driver]] (another repo).
    ** WAITING Review of the saga
       Waiting on e4779 for verdict.
