# TODO.md — pi-etc

> Execution companion to per-skill docs and the pisub/pi-session source.
> Order = priority: the first open epic is the next thing to work on.

---

## Current focus

**Stop the bleeding, then close the gaps.** Field report from session
`019eeab8` exposed two real bugs: (1) `pi-session` truncates pisub logs
via `SessionManager.open()` — `~/.pisub/agents/*.log` files were silently
destroyed (3 confirmed: wiki-glm5, wiki-maintainer, giga-test); (2) pisub
SKILL.md *lied* — it said pi-session "works on pisub logs too", which is
actively dangerous. The agent in that session tried to inspect wiki-glm5's
log, truncated it, then reasoned backwards from the truncated header to
conclude "pisub writes in pi format" (false — it's RPC NDJSON). The daemon
log in `/tmp/pisub-<uid>/` survived as the only witness.

This is the pi-way review-loop failing closed for the wrong reason: an
observability tool that destroys what it observes. Tracks below fix both
sides and the seam between them.

---

## Open work

### Track A — pisub: housekeeping only (rotation + gc)

**Why:** the field-report agent reached for pi-session because pisub "couldn't
inspect its own logs". The wrong fix was to grow pisub into a log-inspector
(grep/summary/...) — that would balloon it into a second pi-session. The
right framing: pisub is a **producer** of NDJSON logs; inspecting them is
the job of standard JSONL tools (`rg`, `jq`, `toonq`), not pisub. Track B
already closed the actual data-loss bug. What remains is housekeeping —
rotation and cleanup — which IS pisub's lawful territory (lifecycle of its
own artifacts), not inspection.

The NDJSON format is documented in pisub SKILL.md so agents know to reach
for `rg`/`jq`/`toonq` instead of pi-session. See Track C.

**A1. log rotation** — cap log size
- Daemon: when `~/.pisub/agents/<name>.log` exceeds `PISUB_MAX_LOG_MB` (default 100), rotate to `.log.1` (overwrite) and start fresh. Keep only one previous.
- Addresses critic-hedge.log=635 MB, hedge-curve.log=271 MB — these can't be safely inspected today.

**A2. `pisub gc [--age 24h]`** — drop logs of long-dead agents
- 24 files in `~/.pisub/agents/` right now; most are hours-old corpses. `kill` only touches registry.json.

**Steps:**
- [x] A1 rotation in daemon `appendJsonl` path
- [x] A2 `pisub gc` command
- [x] smoke-test both on small-cap log (100KB cap → 81 rotations, .log + .log.1 both present; gc --age 0m deletes dead, skips live)

### Track B — pi-session: refuse pisub logs, never destroy

**Why:** `SessionManager.open(path)` from the pi SDK silently truncates any
file that isn't a valid pi session, then writes a session header. Empirically
verified: 1228-byte pisub log → 157-byte session header in one call. This
is the critical-path bug — it causes irreversible data loss the first time
an agent or human runs `pi-session <pisub-log>`.

**B1. Detect pisub logs by content (in `loadEntries`)**
- Before `SessionManager.open(path)`: read the first non-empty line, JSON-parse. If it has `ts` + `type` in `{response, agent_start, agent_end, turn_start, turn_end, message_start, message_update, message_end, tool_execution_start, tool_execution_update, tool_execution_end, queue_update, compaction_start, compaction_end, auto_retry_start, auto_retry_end, extension_error}` → REFUSE.
- Error message names the file, explains the danger, points at `pisub log/report/grep`:
  ```
  pi-session: '<path>' is a pisub RPC event log, not a pi session.
    SessionManager.open() would TRUNCATE it — refusing.
    Inspect it with: pisub log <name> | pisub report <name> | pisub grep <name> <text>
    (name = filename without .log)
  ```
- Exit code 2 (distinct from 0 success / 1 usage error).

**B2. Backup-before-open (defense in depth)**
- Even with B1: copy `<path>` to `<path>.bak` before calling `SessionManager.open`. If `stat(path).size` shrank after `open` → warn loudly that the file was foreign and `.bak` has the original.
- Catches the case where content-detection misses (new event type, malformed line, empty file).

**B3. Fix SKILL.md cross-link + pitfalls**
- pi-session SKILL.md "See also" / scope: state explicitly that it handles ONLY pi sessions. Point at `pisub log` for RPC logs.
- pisub SKILL.md `references/pitfalls.md`: add a WARNING row — never run `pi-session` or anything via `pi --session`/`SessionManager.open()` on `~/.pisub/agents/*.log`. Explain why (silent truncation).

**Steps:**
- [x] B1 content detector + refuse + exit 2
- [x] B2 `.bak` copy + shrink-warn (review-fixed: also removes .bak on valid sessions; checks any size change not just shrink)
- [x] B3 SKILL.md fixes both sides
- [x] regression test: `pi-session <a pisub log>` exits 2, leaves file byte-identical (sha256 before == after)

### Track C — the seam: document the NDJSON contract

**Why:** both tools live in `tools/` and present as siblings to agents. The
refusal in B1 is half the safety; the other half is teaching the model the
contract — pisub writes NDJSON that standard JSONL tools read, pi-session
reads pi sessions only. No new tools to build; just document so agents
reach for `rg`/`jq`/`toonq` instead of pi-session.

**C1. NDJSON + standard-tools section in pisub SKILL.md**
- pisub SKILL.md gets a short "Log format & inspection" section stating:
  - logs are NDJSON (one JSON object per line) at `~/.pisub/agents/<name>.log`
  - each line has `ts` + an RPC event `type` (+ event-specific fields)
  - inspect with `rg` (text search), `jq` (filter/transform), `toonq`
  - NOT a pi session — never run pi-session on it (Track B refuses, but don't rely on it)
- 3-4 concrete recipes: grep assistant text, count event types, extract tool calls.

**C2. pisub daemon log — accept `/tmp` as ephemeral**
- Track B made `.log` truncation impossible, so the daemon log's role shrinks to "human-readable echo for `pisub attach`". `/tmp` is fine — don't move it.
- One line in pitfalls.md noting daemon log is ephemeral (reboot-wiped), the NDJSON `.log` is the durable record.

**Steps:**
- [x] C1 NDJSON section in pisub SKILL.md with rg/jq/toonq recipes
- [x] C2 one-line pitfalls note about daemon log ephemerality

### Track D — upstream: report the SDK footgun to earendil-works/pi

**Why:** `SessionManager.open(path)` silently truncating a non-session file
is a genuine footgun in the pi SDK itself. It will hit anyone who passes a
wrong path — not just our pisub case. Worth a minimal upstream report so the
fix can land where it belongs (SDK should error/throw on foreign input, not
destroy it).

**Scope of the report:** one issue, with the repro (the 1228→157 byte
shrinking test from Track B's regression test), a short writeup of impact,
and a suggested fix (throw or no-op on unrecognized format). Not a PR —
just a bug report. Don't over-engineer.

**Decision (pending):** file or skip. Open questions to settle first:
- Is this a documented behavior or genuinely unintended? (Check pi source
  for `SessionManager.open` contract.)
- Does the fix belong in `open()` (validate-then-open) or in callers
  (pi-session already does this in Track B)?
- If pi SDK is the only caller pattern, our B2 backup is enough and upstream
  can be a one-line "heads up" issue instead of a fix-request.

**Steps:**
- [x] Read `SessionManager.open` source in pi SDK, confirm behavior + check for any documented contract
- [x] Search existing issues for prior reports (github.list_issues + github.search_issues + zai-zread.search_doc)
- [x] Decide: **file a bug report** — the fix for #932 over-truncates non-session files
- [x] Draft issue text in `docs/upstream-issue-draft.md` (v2, aligned with CONTRIBUTING + bug.yml template)
- [x] Submit to earendil-works/pi → **#6002** (auto-closed not_planned, labels: bug+untriaged — expected for new contributor per CONTRIBUTING)
- [ ] Wait for maintainer triage (daily review; reopen if worthwhile)

### Findings (2026-06-21)

**Root cause confirmed in source** (`dist/core/session-manager.js`, `setSessionFile` ~line 532):

```js
// If file was empty or corrupted (no valid header), truncate and start fresh
// to avoid appending messages without a session header (which breaks the session)
if (this.fileEntries.length === 0) {
    const explicitPath = this.sessionFile;
    this.newSession();           // creates new session header
    this.sessionFile = explicitPath;
    this._rewriteFile();         // TRUNCATES file, writes header
    this.flushed = true;
    return;
}
```

`SessionManager.open(path)` → constructor → `setSessionFile()` → `loadEntriesFromFile()`. That loader returns `[]` for **any** file without a valid `type:"session"` header — including non-session files (pisub NDJSON logs, arbitrary JSONL, empty files). The #932 fix then truncates and rewrites them as a fresh session. **3 pisub logs destroyed this way** (wiki-glm5.log 3.2MB→133B, wiki-maintainer.log, giga-test.log).

**Prior issues search (2026-06-21):**
- `github.search_issues` "SessionManager" (83 results), "truncate session" (55), "corrupt session file" (11), "open non-session" (3) — **none** describe `open()`/`setSessionFile()` truncating non-session files.
- Closest: **#932** "SessionManager.setSessionFile() corrupts session when loading empty/invalid file" (Jan 2026, closed/completed) — this is the issue the over-truncating fix was written for. Same method, different symptom: #932 was about *appending without a header*; the fix introduced *truncating non-session files*.
- `zai-zread.search_doc` returned only general docs, no issue matches.

**Decision: file a bug report.** The issue is real (silent irreversible data loss on the first `open()` call), reproducible, and not a duplicate. Framing: the #932 fix is correct for its case (corrupted session files) but over-broad — `loadEntriesFromFile() === []` is treated as "corrupted session" when it also means "not a session file at all". Suggested fix: refuse to open (throw) when the file exists but has no session header AND was not just created, rather than silently truncating. Or at minimum, back up the original file before rewriting.

Our Track B (pi-session refuses pisub logs by content) is the local mitigation; the upstream fix would protect all callers, not just our tool.

### Submission (2026-06-23)

- Issue filed: https://github.com/earendil-works/pi/issues/6002
- Title: `SessionManager.open()` silently truncates non-session files
- Body: 4-field bug report template (What happened / Steps to reproduce / Expected behavior / Version), ~35 lines, fits one screen per CONTRIBUTING.
- State: auto-closed `not_planned` with labels `bug`, `untriaged` — expected for new contributors per CONTRIBUTING ("All issues and PRs from new contributors are auto-closed by default"). Maintainers review daily and reopen worthwhile ones.
- No AI-specific label exists in the repo (28 labels total, none AI/agent-related). Per CONTRIBUTING ("if you must [use an LLM], follow up with a clearly AI labeled comment"), the submitter should add a comment disclosing AI assistance — but only after the issue is reopened (commenting on an auto-closed issue adds noise without benefit).



### Track F — pisub SKILL.md: document `spawn` does not accept stdin

**F1. `pisub spawn <name> <<'EOF' ... EOF` silently drops the heredoc — spawn only registers the agent, `send` is a separate step.**
Confirmed in session `019eedb9`: three researchers spawned with heredoc prompts (`gh-researcher`, `crates-researcher`, `web-researcher`) all came up `idle` with empty logs — the prompt never reached the agent. `pisub spawn` parses flags only; stdin is ignored. The SKILL.md shows `spawn` then `send` as separate steps, but never explicitly warns that `spawn` ignores stdin, so the natural `spawn <<EOF` pattern fails silently.

Fix direction:
- SKILL.md: add an explicit **"`spawn` does not read stdin"** callout in the Workflow section, with the correct pattern:
  ```bash
  pisub spawn researcher --model deepseek/deepseek-v4-pro --cwd ~/dev --tools bash,read
  pisub send researcher "$(cat /tmp/prompt.md)"   # or inline string
  ```
- Optional (source): make `pisub spawn` read stdin if present and auto-`send` it, so `spawn <<EOF` works as the user expects. Lower priority — doc fix covers the gap.

**Steps:**
- [ ] SKILL.md: add stdin callout + correct spawn+send pattern
- [ ] Optional: `pisub spawn` reads stdin → auto-send


## Hygiene

- An item earns a place here only when it survives a single session. Session-scoped steps live in TaskCreate, not here.
- **Delete done items** — history lives in `git log` + CHANGELOG, not here. Done items break the 30-second scan.
- Every epic links to its rationale (Decision row or inline "Why"); TODO is the index, source is the detail.
- Keep under ~80 lines of open items. If it grows, the problem is too many open tracks, not file organization.
- Track ordering = priority. A (pisub self-sufficiency) and B (pi-session refuse) are co-critical — do A1/A2 and B1/B2 in the same pass, then C, then D.
- See `~/wiki/pages/Companion_Files_Best_Practices.txt` for the rationale.
