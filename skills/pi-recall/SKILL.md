---
name: pi-recall
description: Cross-session memory over raw pi session transcripts — BM25-ranked recall, full-entry expand, session catalog — via the pi-recall CLI (park output to a file, then grep/slice — no context guard needed). Use before domain work on a known topic (past decisions, prior failures, "did we already try X", what other sessions concluded). Never for facts derivable from the repo or git history — read those directly.
---

# pi-recall — cross-session memory

## Primary door: CLI, park-then-slice

Recall output is plain text. Park it in a file and work it with ordinary
shell reflexes — grep to navigate, sed/head to read slices. The file is the
offload; no context guard, no digest discipline. Re-grep when the question
changes; the bytes stay on disk.

    pi-recall recall 'pi-durable chord WP8' --scope global --limit 20 > /tmp/r.md
    grep -E '^\[' /tmp/r.md | head            # ranked hits: id=, score, snippet
    sed -n '12,40p' /tmp/r.md                 # read any slice on demand
    pi-recall outline session=<sid> | head -30    # foreign session skeleton (0.3.0+)
    pi-recall outline session=<sid> role=user     # the jq select(role==user) idiom, encoded

## Two-step idiom: recall navigates, expand reads

    pi-recall recall 'contour guard vitest' --scope global --limit 5 > /tmp/r.md
    pi-recall expand id=<8-hex id from a hit> > /tmp/e.md
    wc -c /tmp/e.md; sed -n '1,60p' /tmp/e.md  # long entries — read in chunks

expand is the sanctioned full read (lossless; long texts page via the
textOffset hint it prints). Never grep session JSONL by hand.

## Recipe 1 — topic dig before domain work

    pi-recall recall 'shell-lab fabric-exec выкорчёвывание' --scope global --limit 20 > /tmp/r.md
    grep -E '^\[' /tmp/r.md | head            # pick hits by score + snippet
    pi-recall expand id=<hex> > /tmp/e.md     # full entries for the chosen ones

## Recipe 1b — open a foreign session by id (the "look at session X" case)

    pi-recall outline session=<sid> | head -30     # ordered skeleton: index/type/role/tool/preview
    pi-recall outline session=<sid> role=user      # only user rows — the jq select idiom, encoded
    pi-recall expand session=<sid> idx=<picked indices> > /tmp/e.md   # full entries at the picked points

## Recipe 2 — read a known long entry in chunks

    pi-recall expand session=<path|sid> idx=146 maxChars=20000 > /tmp/e.md
    wc -c /tmp/e.md                           # total size, then slice:
    sed -n '1,80p' /tmp/e.md                  # head, continue with next ranges

## Other doors

The package also registers `memory_recall` / `memory_expand` /
`memory_sessions` tools (direct in its default upstream shape, and
callable from codemode as `tools.memory_recall({...})`). This contour
hides them from the model surface (defaultTools minus-list) — the CLI
above is the door here: hits park to a file instead of flowing into
context.
- Structural questions (timeline, role filter, tool-usage counts, session
  discovery) → the **pi-session** skill: `pi-session <file> --role user`,
  `--timeline`, `--tool-usage` — deterministic parse views that ranked
  search does not provide.
- Multi-machine: `pi-memory-sync.sh` rsyncs session stores between
  machines; the engine's portable sources / fs adapters index other
  machines' archives.

## Scope intuition

- global — default for recall; run it before domain work on a known topic.
- project — this repo's chronology; session — own lineage (sessions default).
- `--branches all` — also abandoned off-lineage tree siblings.

## Query shape and paging

Default matches any term (OR); `--phrase` = adjacency, `--regex` = pattern,
`--all` = every term in one entry. Cold sessions cannot prove adjacency —
probe a cold session with one rare literal term first. Page with
`--limit`/`--offset` (the output names the next offset).

## Liveness and trust

The current session indexes on the fly. The index is a disposable cache;
session JSONL is truth — stale or corrupt index state is refused and rebuilt,
never silently served. Read the coverage header line: stale/incomplete counts
or listed reasons mean an empty page is NOT a no-match proof — narrow the
query, or browse `pi-recall sessions --scope global` by cwd/mtime and expand
the picked session directly.

## Boundaries

Not for anything derivable from code or git — read the repo instead. Not for
one-off dialog details: recall is for durable cross-session decisions and
failures, not chit-chat retrieval.
