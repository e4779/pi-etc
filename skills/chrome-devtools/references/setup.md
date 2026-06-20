# Chrome DevTools — First-run Setup

> **Load this only when a prerequisite is missing.** If `mcporter daemon status`
> shows chrome-devtools connected, skip this file entirely.
>
> Run these phases with `bash`. They are safe to repeat — every step is idempotent.
> Pattern lifted from the `doctor` skill in `pi-design-skill`.

The skill is useless without four things in place: `mcporter` CLI, a
Chrome/Chromium binary, a `chrome-devtools` entry in `~/.mcporter/mcporter.json`,
and a running daemon. This guide gets all four green on any OS, then smoke-tests.

---

## Phase 1 — Inventory

Detect the OS once, then run all checks. **All of these are read-only.**

```bash
# OS family — drives every path/command below
case "$(uname -s 2>/dev/null)" in
  Linux*)  OS=linux;;
  Darwin*) OS=macos;;
  *)       OS=windows;;     # WSL, Git Bash, or native Windows
esac
echo "OS=$OS"
```

Then check each prerequisite (run them; collect the outputs):

| # | Check | Command |
|---|---|---|
| 1 | mcporter on PATH | `mcporter --version` |
| 2 | Chrome/Chromium binary | see **Chrome detection** below |
| 3 | chrome-devtools server configured | `mcporter list chrome-devtools --brief` |
| 4 | daemon alive | `mcporter daemon status` |
| 5 | existing config file | `test -f ~/.mcporter/mcporter.json && echo present \|\| echo missing` |

### Chrome detection (cross-platform)

```bash
# 1. Explicit override always wins
echo "CHROME_PATH=$([ -n "$CHROME_PATH" ] && echo "$CHROME_PATH" || echo unset)"

# 2. Well-known locations per OS
case "$OS" in
  linux)  for b in /usr/bin/google-chrome /usr/bin/chromium /usr/bin/chromium-browser /snap/bin/chromium; do [ -x "$b" ] && echo "found: $b"; done ;;
  macos)  for b in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" /Applications/Chromium.app/Contents/MacOS/Chromium; do [ -x "$b" ] && echo "found: $b"; done ;;
  windows) for b in "/c/Program Files/Google/Chrome/Application/chrome.exe" "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"; do [ -x "$b" ] && echo "found: $b"; done ;;
esac

# 3. PATH fallback (which / where)
command -v google-chrome || command -v chromium || command -v chrome || true
```

---

## Phase 2 — Report

Print a structured status block so the user sees what's green and what's not:

```
mcporter CLI:        ✓ v0.11.3 / ✗ (→ npm i -g mcporter)
Chrome binary:       ✓ /usr/bin/chromium / ✗ (→ install Chrome, or set CHROME_PATH)
chrome-devtools cfg: ✓ in ~/.mcporter/mcporter.json / ✗ (→ Phase 3 will add it)
daemon:              ✓ connected / ✗ idle / ✗ not running
config file:         ~/.mcporter/mcporter.json (present/missing)
```

Anything green can be skipped in Phase 3.

---

## Phase 3 — Repair (with user consent)

For each ✗, ask the user before changing anything. Do NOT auto-install silently.
Repair commands per item:

### 3a. mcporter missing

```bash
npm install -g mcporter
mcporter --version        # verify
```

### 3b. Chrome missing

- **Linux (Debian/Ubuntu):** `sudo apt install -y chromium-browser`
  (or `google-chrome-stable` from Google's repo)
- **Linux (Snap):** `sudo snap install chromium`
- **macOS:** `brew install --cask google-chrome` (or download from google.com/chrome)
- **Windows:** `winget install Google.Chrome` (or download installer)

On headless servers, Chromium is enough — pass `--headless` in the server args
(see 3c). If Chrome lives somewhere unusual, have the user `export CHROME_PATH=`
the full path and retry Phase 1.

### 3c. chrome-devtools entry missing (or needs correcting)

The config lives at `~/.mcporter/mcporter.json` under `mcpServers`. The only
OS-specific bit is `--executablePath` — use the Chrome path found in Phase 1
(or omit it to let mcporter auto-detect; add `--headless` for servers).

Write the entry using Node (avoids `jq` dependency, preserves any existing
servers in the file):

```bash
node -e '
const fs = require("fs");
const os = require("os");
const path = require("path");
const p = path.join(os.homedir(), ".mcporter", "mcporter.json");
const cfg = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
cfg.mcpServers = cfg.mcpServers || {};
const exe = process.env.CHROME_PATH || "";   // empty = let mcporter find Chrome
cfg.mcpServers["chrome-devtools"] = {
  description: "Chrome DevTools protocol bridge for driving local tabs during debugging or automation.",
  command: "npx",
  args: ["-y", "chrome-devtools-mcp@latest", "--headless",
         ...(exe ? ["--executablePath", exe] : [])],
  env: { npm_config_loglevel: "error" }
};
fs.mkdirSync(path.dirname(p), { recursive: true });
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
console.log("wrote", p);
'
```

> **Headed vs headless:** keep `--headless` for servers/CI. Drop it if you want
> to *see* the browser while the agent drives it (debugging, demos). On a desktop
> with no display, headed Chrome won't start — leave `--headless` in.
>
> **Already-logged-in Chrome:** instead of letting mcporter launch a fresh
> profile, point it at the user's running Chrome via `--browserUrl
> http://127.0.0.1:9222` (see `recipes.md` → "Use your real Chrome profile").

### 3d. daemon not running

```bash
mcporter daemon start
sleep 2
mcporter daemon status      # expect "chrome-devtools: connected"
```

If it was already running with a stale config, restart so it picks up 3c:

```bash
mcporter daemon restart && sleep 3
```

---

## Phase 4 — Smoke test

One call proves the whole chain works:

```bash
mcporter call chrome-devtools.list_pages --output text
```

Expected:

```
## Pages
1: about:blank [selected]
```

Any non-empty page list = success. The first launch spawns Chrome under the
hood, so allow ~10s. If it times out, retry once (Chrome is slow to cold-start).

---

## Phase 5 — If the smoke test failed

Don't loop blindly. Diagnose by symptom:

| Symptom | Likely cause | Fix |
|---|---|---|
| `mcporter: command not found` | 3a didn't take | re-run `npm i -g mcporter`, check `npm root -g` is on PATH |
| `Cannot find module ... chrome-devtools-mcp` | npx cache corrupt | `rm -rf ~/.npm/_npx && npm cache clean --force`, retry |
| `Target closed` / Chrome won't launch | wrong `--executablePath`, or Chrome already running and locking the profile | close all Chrome windows; remove `--executablePath` to auto-detect; or switch to `--browserUrl` |
| `Connection closed` right after start | tab crashed on a heavy profile | restart daemon; use a dedicated `--userDataDir`; see frozen-tabs note in `SKILL.md` |
| `Navigation timeout` on `list_pages` | Chrome cold start | retry the call once |
| daemon says `connected` but calls hang | stale daemon from before config change | `mcporter daemon restart && sleep 3` |

Once green, this file is done — return to `SKILL.md` for the actual workflow.

---

## Uninstall / disable

If the user wants chrome-devtools gone:

```bash
mcporter daemon stop
node -e '
const fs=require("fs"),os=require("os"),path=require("path");
const p=path.join(os.homedir(),".mcporter","mcporter.json");
if(!fs.existsSync(p))process.exit(0);
const c=JSON.parse(fs.readFileSync(p,"utf8"));
delete (c.mcpServers||{})["chrome-devtools"];
fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");
console.log("removed chrome-devtools from",p);
'
```
Chrome itself and `mcporter` are left installed (other tools may depend on them).
