---
name: fabric-memory
description: >-
  Search and read old pi sessions via Pi Fabric's memory provider
  (memory.recall / memory.expand / memory.walk / memory.sessions) inside
  fabric_exec. Use for session archaeology — "что было в прошлой сессии",
  "find where we did X", cross-session history, past decisions and failures.
  Supersedes pi-session — never grep session JSONL by hand.
  RU: прежде чем начинать задачу — проверь в памяти, не делали ли мы это уже; что решали в прошлых сессиях.
---

# fabric-memory — session recall in Pi Fabric

Upstream truth: `memory-recall.md` in the installed pi-fabric package
(`<~/.pi/agent/npm>/node_modules/pi-fabric/docs/memory-recall.md`). This
skill is the operational recipe layer on top.

## Mental model

- Session JSONL is the source of truth; the memory index is a derived,
  disposable cache (hot shards for recent sessions, cold digests for older —
  tiers by recency, `memory.hotSessions` boundary).
- `recall` = navigation (ranked snippets), `expand` = reading (full entries),
  `walk` = scan/filter/reduce/traverse, `sessions` = catalog.
- NEVER locate or parse `~/.pi/agent/sessions/*.jsonl` yourself: follow calls
  carry integrity bindings (SHA-256 source hashes, lineage fingerprints) and
  stale sources are refused.

## The #1 gotcha: scope

`memory.recall` defaults to `scope: "session"` — the CURRENT session only.
Old sessions need an explicit scope:

- `scope: "project"` — sessions under the current cwd
- `scope: "global"` — everything
- `scope: "session:<id-or-path>"` — one session

`branches` defaults to `"active"` (each session's parent-linked path);
pass `branches: "all"` to also search abandoned `/tree` siblings.

## Recipes

```ts
// Ranked discovery across all sessions (any-term OR by default):
const r = await memory.recall({
  query: 'memos 4779 deploy',
  scope: 'global',
  branches: 'all',
});
// r.hits[].snippet, r.total pre-page count.
// Full entry / cold-session resolution:  await tools.call(hit.follow)
// Continue pages while r.next !== null:  await tools.call(r.next)

// Strict matching:
await memory.recall({ query: '"Use CEF" Stage 1', queryMatch: 'all', scope: 'project' });
await memory.recall({ query: 'src/foo.ts', queryMode: 'phrase' });   // adjacency matters
await memory.recall({ query: 'timeout.*restart', queryMode: 'regex' }); // sandboxed worker

// Structural history — no lexical query needed:
await memory.recall({
  scope: 'global',
  ref: 'pi.edit',            // or provider / action / role / tool
  outcome: 'failed',          // succeeded | failed | aborted | timed_out
  since: Date.now() - 7 * 864e5,
});

// Full-entry reading with neighbors (session path comes from hit.follow args):
await memory.expand({ session, indices: [12], before: 2, after: 2 });

// Map/reduce over whole sessions (visitor may await nested calls; false stops):
await memory.walk(args, async (entry, i) => { /* ... */ });

// Catalog:
await memory.sessions({ scope: 'global' });
// → [{id, file, cwd, mtime, entryCount, tier: 'hot'|'cold', branches}]
```

## Reading coverage: empty ≠ proof

`coverage.complete === false` lists reasons (`max_entry_chars`,
`max_cold_cache_bytes`, `duplicate_entry_id`, `regex_timeout`, …). An empty
result under incomplete coverage is NOT an authoritative no-match — narrow
the query, or hydrate a cold candidate via `tools.call(hit.follow)`.

## Why not pi-session

pi-session greps raw JSONL; fabric memory does the same job with BM25
ranking, structural filters, tiered cache, and integrity bindings — without
loading megabytes of transcripts into context. The pi-session skill is
hidden from the model (`disable-model-invocation: true`); `/skill:pi-session`
remains as a manual fallback.
