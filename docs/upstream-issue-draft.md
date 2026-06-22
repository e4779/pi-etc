# Upstream issue draft — earendil-works/pi

Status: DRAFT v2, aligned with CONTRIBUTING.md + bug.yml template.
Awaiting submission (by user — MCP token lacks write).

Submitted URL: _(pending)_

**Timing note:** today is Sunday 2026-06-21. CONTRIBUTING says weekend
issues are not guaranteed to be reviewed. Wait until Monday 2026-06-22 to
submit, or take it to Discord if urgent (it isn't — Track B mitigates locally).

**AI disclosure:** per CONTRIBUTING ("Write in your own voice... if you must
[use an LLM], follow up with a clearly AI labeled comment"), the submitter
should either rewrite this in their own voice OR post the issue as-is and
immediately add a comment like: "Drafted with AI assistance (Claude); I
reviewed and stand behind the report." The PR #5850 in this repo used the
convention "This PR is AI-assisted." at the end of the body — same idea.

**Template:** use the Bug Report template (`.github/ISSUE_TEMPLATE/bug.yml`).
Fields below map to the template's 4 textareas.

---

## Title

`SessionManager.open()` silently truncates non-session files

## What happened?

`SessionManager.open(path)` — and the `--session <path>` CLI surface —
silently destroys any file that isn't a valid pi session. Pointing it at a
3.2 MB NDJSON log file truncated it to a 133-byte `{"type":"session",...}`
header in one call, with no warning, error, or backup. Three files lost
this way before I traced the cause. No recovery is possible — the original
content is overwritten on the first call.

Reproduces without any extensions loaded (`pi -ne`).

## Steps to reproduce

```bash
echo '{"type":"event","data":"not a session"}' > /tmp/not-a-session.log
wc -c /tmp/not-a-session.log   # ~45 bytes (or 3.2 MB in my real case)
pi --session /tmp/not-a-session.log -p "say hi" --no-session 2>/dev/null
wc -c /tmp/not-a-session.log   # 133 bytes — original content gone
head -1 /tmp/not-a-session.log # {"type":"session","version":3,...}
```

Root cause is in `setSessionFile()` (called from the constructor behind
`open()`): when `loadEntriesFromFile()` returns `[]` (no valid session
header), it calls `newSession()` + `_rewriteFile()`. That's the fix for
#932, correct for corrupted sessions but over-broad — a file that simply
isn't a session also returns `[]` and gets truncated.

## Expected behavior

Throw when the file exists, is non-empty, and has no valid session header
— the caller passed an explicit path; "not a session" is a user error
worth surfacing, not silently fixing. The auto-repair behavior could stay
available via a separate `--repair` flag or `SessionManager.repair()` for
the #932 case where the user knows the file is a corrupted session.

Happy to PR this if you're open to the direction.

## Version

0.79.6, Node v24.13.1, Linux

---

## Notes for submitter

- Repo: `earendil-works/pi` (GitHub). Use the **Bug Report** template —
  the fields above (What happened / Steps to reproduce / Expected behavior
  / Version) map 1:1 to the template's textareas.
- Auto-closed by default for new contributors — that's expected per
  CONTRIBUTING; maintainers reopen worthwhile ones daily.
- One screen is the target. This draft is ~35 lines of body — fits.
- Don't edit CHANGELOG.md (maintainers do that).
- Don't open a PR until the issue gets `lgtm`.
- If they ask for the PR: the fix is small — guard in `setSessionFile()`
  when `fileEntries.length === 0` and the file is non-empty: throw or back
  up before `_rewriteFile()`. But wait for maintainer direction first
  (throw vs backup vs flag).
