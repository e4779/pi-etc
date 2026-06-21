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
- [ ] Read `SessionManager.open` source in pi SDK, confirm behavior + check for any documented contract
- [ ] Decide: bug report vs heads-up issue vs skip
- [ ] If filing: draft issue text in `docs/upstream-issue-draft.md`, review, submit

---

### Track E — pisub robustness bugs (filed from session observation)

**E1. Daemon dies silently when `~/.pisub/agents/` disappears mid-run (unhandled ENOENT in `appendJsonl`).**
Repro confirmed: an agent that runs `rm -rf ~/.pisub/agents` (e.g. executing an acceptance test that cleans its own slate) kills its own log directory mid-run. `appendJsonl` (line 135) calls `appendFileSync(path, …)` with **no try/catch**; the ENOENT flies up into the `rl.on("line", …)` callback in `runDaemon`, crashes the daemon, and no `agent_end` is emitted — so `pisub wait` hangs until its timeout. (This is what killed agent `ac1` during the Track A acceptance test.)

Note: the original hypothesis — "missing dir at spawn" — does NOT reproduce: `ensureDirs()` (line 308) plus `socketPathFor` (which `mkdirSync`s `/tmp/pisub-<uid>/`) cover the spawn path. The bug is strictly mid-run dir disappearance, which is rare in normal use but catastrophic when it happens (silent hang, no diagnostics).

Fix direction:
- Wrap `appendJsonl`'s `appendFileSync` in try/catch. On ENOENT (or any write error): re-`ensureDirs()` once and retry; if still failing, emit a synthetic `agent_end`-equivalent to the daemon log + socket clients and shut down cleanly (so `pisub wait` returns instead of hanging).
- Same treatment for the `appendFileSync(daemonLog, …)` calls in `runDaemon` (they already tolerate the fd write, but not the daemonLog append itself).
- Do NOT make `appendJsonl` silently swallow errors — the goal is loud-then-graceful-shutdown, not silent drop.

**Steps:**
- [x] reproduce: agent runs `rm -rf ~/.pisub/agents` mid-run → daemon dies, no agent_end, `pisub wait` hangs
- [x] root cause: `appendJsonl` → `appendFileSync` with no try/catch; ENOENT crashes `rl.on("line")`
- [x] fix: try/catch in `appendJsonl`, re-ensureDirs + retry once, then graceful shutdown with synthetic agent_end
- [x] regression: agent runs `rm -rf ~/.pisub/agents` → daemon recovers (ensureDirs recreates dir), wait returns exit 0; permanent failure (read-only dir) → FATAL logged, wait returns in <1s (no hang)

---

**E2. `pisub report` returns empty for glm-4.7 agents — they put their final summary in `thinking`, not `text`.**
Observed twice (agents `tb1` and `ac2`, both glm-4.7, both exit 0 via `pisub wait`). The agent reaches `agent_end` but `pisub report` prints "no assistant text found". Root cause confirmed: 12 of 14 assistant turns in the ac2 log carry `content_types=['thinking','toolCall']` with NO `text` block. The final turn has `content_types=['thinking']` only, and the thinking block contains the full implementation report ("Track A + C — Implementation Report..."). `extractAssistantReports` (line 970) and its inline copy in `cmdReport` (line 1010) filter for `type=='text'` blocks and skip everything else, so they see zero reportable content.

This is NOT an output-token-limit issue (lazy prior hypothesis, discarded). It's a model-behavior + parser mismatch: glm-4.7 reasons and summarizes inside thinking blocks; the report extractor ignores thinking.

Fix direction:
- In both `extractAssistantReports` and the inline copy in `cmdReport`: collect `b.type === "thinking"` content alongside `text`. When a turn has no `text` block but has `thinking`, fall back to thinking — label it clearly (e.g. prefix `[from thinking]\n`) so the reader knows it's reasoning, not a final answer.
- Keep collecting `text` preferentially when both exist (text is the model's intended output; thinking is a fallback).
- Add a `thinking` field to the `AssistantReport` interface so callers can distinguish.

**Steps:**
- [x] reproduce: confirmed on ac2.log (12/14 assistant turns thinking-only)
- [x] root cause: `extractAssistantReports` + inline copy skip thinking; glm-4.7 puts summary in thinking
- [x] fix: collect thinking in both places, fall back when no text, label as `[from thinking]`
- [x] test: `pisub report e2synth` on synthetic thinking-only log shows the report with `[from thinking]` label; `--last N` header includes `[from thinking]` marker

---

## Hygiene

- An item earns a place here only when it survives a single session. Session-scoped steps live in TaskCreate, not here.
- **Delete done items** — history lives in `git log` + CHANGELOG, not here. Done items break the 30-second scan.
- Every epic links to its rationale (Decision row or inline "Why"); TODO is the index, source is the detail.
- Keep under ~80 lines of open items. If it grows, the problem is too many open tracks, not file organization.
- Track ordering = priority. A (pisub self-sufficiency) and B (pi-session refuse) are co-critical — do A1/A2 and B1/B2 in the same pass, then C, then D.
- See `~/wiki/pages/Companion_Files_Best_Practices.txt` for the rationale.
