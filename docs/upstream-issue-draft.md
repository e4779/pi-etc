# Upstream issue draft — earendil-works/pi

Status: DRAFT, awaiting submission. Once submitted, paste the issue URL below.

Submitted URL: _(pending)_

---

## Title

`SessionManager.open()` silently truncates non-session files (fix for #932 is over-broad)

## Body

### What happened?

`SessionManager.open(path)` (and the `--session <path>` / `--continue` / `--resume` CLI surface that calls it) silently destroys any file that is not a valid pi session. A 3.2 MB NDJSON log file I had pointed at it was truncated to 133 bytes — a fresh `{"type":"session","version":3,...}` header — in a single call, with no warning and no backup. Three files were lost this way before I traced the cause.

This is a data-loss bug on the first call: there is no recovery, no error, and no signal to the caller that the file was not a session.

### Steps to reproduce

```bash
# 1. Create any file that is not a pi session (no valid session header line).
cat > /tmp/not-a-session.log <<'EOF'
{"ts":"2026-06-21T12:00:00Z","type":"event","data":"some NDJSON log line"}
{"ts":"2026-06-21T12:00:01Z","type":"event","data":"another line"}
EOF

# 2. Confirm size before.
wc -c /tmp/not-a-session.log
# → ~140 bytes (or 3.2 MB in my real case)

# 3. Open it as a session via the CLI — this calls SessionManager.open().
pi --session /tmp/not-a-session.log -p "say hi" --no-session 2>/dev/null

# 4. The file is now a 133-byte session header. Original contents gone.
wc -c /tmp/not-a-session.log
head -1 /tmp/not-a-session.log
# → {"type":"session","version":3,"id":"...","timestamp":"...","cwd":"..."}
```

The same happens programmatically:

```js
import { SessionManager } from "@earendil-works/pi-coding-agent";
const sm = SessionManager.open("/tmp/not-a-session.log");
// File is now truncated to a session header. No throw, no warning.
```

### Root cause

In `packages/coding-agent/src/core/session-manager.ts`, `setSessionFile()` (called from the constructor behind `SessionManager.open()`):

```js
setSessionFile(sessionFile) {
    this.sessionFile = resolvePath(sessionFile);
    if (existsSync(this.sessionFile)) {
        this.fileEntries = loadEntriesFromFile(this.sessionFile);
        // If file was empty or corrupted (no valid header), truncate and start fresh
        // to avoid appending messages without a session header (which breaks the session)
        if (this.fileEntries.length === 0) {
            const explicitPath = this.sessionFile;
            this.newSession();
            this.sessionFile = explicitPath;
            this._rewriteFile();   // ← TRUNCATES the file, writes a session header
            this.flushed = true;
            return;
        }
        // ...
    }
}
```

`loadEntriesFromFile()` returns `[]` for **any** file without a valid `type: "session"` first entry — including:
- non-session JSONL/NDJSON files (logs, tool outputs, arbitrary data)
- empty files
- files with a corrupted session header

The guard added for #932 (setSessionFile corrupts session on empty/invalid file) then treats "no valid header" as "corrupted session, start fresh" and truncates. The #932 fix is correct for its case (a corrupted session file that should be recovered), but it cannot distinguish "corrupted session" from "not a session file at all" — and the latter should not be silently rewritten.

### Expected behavior

Pointing `SessionManager.open()` (or `--session <path>`) at a file that exists but is not a valid pi session should **not** destroy the file. At minimum, one of:

1. **Throw** when the file exists, is non-empty, and has no valid session header. The caller passed an explicit path; if it's not a session, that's a user error worth surfacing, not silently fixing.
2. **Back up** the original file (`.bak` or `<path>.<timestamp>.bak`) before rewriting, so the content is recoverable.
3. **Warn** to stderr and require an explicit `--force` / `--repair` flag to proceed with truncation.

Option 1 (throw) seems safest for `open()` with an explicit path — it's a "you asked me to open X as a session, X is not a session" condition. The auto-repair behavior could stay available via a separate `SessionManager.repair(path)` or a `--repair` flag for the #932 case where the user knows the file is a corrupted session they want recovered.

### Impact

- Silent, irreversible data loss on the first call. No warning, no backup, no error.
- Any tool or agent that passes a user-supplied path to `SessionManager.open()` (or `pi --session <path>`) can destroy arbitrary files if the path is wrong or points at a non-session file.
- In my case: a sub-agent orchestration tool writes NDJSON logs to `~/.pisub/agents/*.log`. A separate inspection tool (built on the pi SDK) called `SessionManager.open()` on those logs thinking they were session files. Three logs were destroyed before the cause was found.

### Workaround

None at the pi layer. The caller must verify the file is a valid session (e.g. `head -1` parses as JSON with `type: "session"`) before calling `SessionManager.open()`. We've added that guard in our inspection tool, but every embedder is vulnerable until the SDK refuses or backs up.

### Version

- `@earendil-works/pi-coding-agent` 0.79.6
- Node v24.13.1, Linux

### Related

- #932 — the issue this truncating fix was written for. The fix is correct for corrupted sessions but over-broad: `loadEntriesFromFile() === []` is treated as "corrupted session" when it also means "not a session file at all".

---

## Notes for submitter

- Repo: `earendil-works/pi` (GitHub)
- Labels to suggest: `bug` (the maintainer triages, but this is clearly a bug)
- Tone: report, don't prescribe. The "Expected behavior" section offers options, not demands.
- The repro is self-contained and deterministic — should pass triage easily.
- If asked for a PR: the fix is small (throw or back up in `setSessionFile` when `fileEntries.length === 0` and file is non-empty), but I'd want maintainer sign-off on the direction (throw vs backup vs flag) before writing it.
