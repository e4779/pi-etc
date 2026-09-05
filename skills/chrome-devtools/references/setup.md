# Chrome DevTools — First-run Setup (WSL → Windows Chrome)

> **Load this only when a prerequisite is missing.** If
> `await mcp.chrome_devtools.list_pages({})` returns pages, skip this file.
>
> Every step is idempotent and safe to repeat. Ask the user before changing
> anything (Phase 3).

The chain has four links: **Windows Chrome instances** (debug ports),
**mirrored WSL networking** (127.0.0.1 shared), **config entries** in
`~/.mcporter/mcporter.json` (`--browserUrl`), and **fabric's MCP runtime**
(pooled connections, cold-start on first call).

| server | Chrome | port | use |
|---|---|---|---|
| `chrome-devtools` | `chrome-debug.ps1` | 9222 | direct — default |
| `chrome-devtools-proxy` | `chrome-debug-proxy.ps1` | 9223 | blocked foreign sites (bypass proxy <proxy-host>:8888) |

Scripts live in `C:\Users\e41q\.local\bin\`. Never open RU domains through
9223 (detection exposure) — see global `~/.pi/agent/AGENTS.md`.

---

## Phase 1 — Inventory (read-only)

```bash
# 1. Ports reachable? (mirrored networking + instance up)
curl -s -m 3 http://127.0.0.1:9222/json/version || echo "9222 DOWN"
curl -s -m 3 http://127.0.0.1:9223/json/version || echo "9223 DOWN"

# 2. Config entries present?
jq -r '.mcpServers | keys[]' ~/.mcporter/mcporter.json   # expect both chrome-* entries
jq '.mcpServers["chrome-devtools"].args' ~/.mcporter/mcporter.json  # expect --browserUrl ...:9222

# 3. Launcher scripts exist on the Windows side?
powershell.exe -NoProfile -Command "Get-ChildItem C:\Users\e41q\.local\bin\chrome-debug*.ps1 | Select -Expand Name"

# 4. Mirrored networking on?
wslinfo --networking-mode 2>/dev/null || grep -i networkingMode /mnt/c/Users/e41q/.wslconfig
```

Inside fabric:

```ts
await tools.call({ ref: "mcp.$servers" });   // both chrome servers listed, tools: 29 each?
```

## Phase 2 — Report

```
port 9222 (direct):    ✓ version json / ✗ down → Phase 3a
port 9223 (proxy):     ✓ / ✗ down → Phase 3a
config entries:        ✓ both map to --browserUrl / ✗ → Phase 3b
launcher scripts:      ✓ chrome-debug*.ps1 / ✗ → recreate (user)
mirrored networking:   ✓ mirrored / ✗ → Phase 3c (needs wsl --shutdown!)
fabric registration:   ✓ in $servers / ✗ → Phase 3b + $reload
```

## Phase 3 — Repair (with user consent)

### 3a. Chrome instance down

Start it via Windows interop (or ask the user to run the script on Windows):

```bash
powershell.exe -NoProfile -Command "$p = Start-Process -WindowStyle Hidden powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\Users\e41q\.local\bin\chrome-debug.ps1' -PassThru; $p.Id"
# note the PID for later cleanup:
# taskkill.exe /PID <pid> /T /F
sleep 3
curl -s -m 3 http://127.0.0.1:9222/json/version   # verify
```

Cold start of the mb-profile instance may restore many tabs and wedge early
MCP calls for a minute or two — wait for it to settle.

### 3b. Config entry missing / wrong

```bash
jq '.mcpServers["chrome-devtools"] = {
  description: "Windows Chrome (direct) via CDP from WSL",
  command: "npx",
  args: ["-y","chrome-devtools-mcp@latest","--browserUrl","http://127.0.0.1:9222"],
  env: { npm_config_loglevel: "error" }
}' ~/.mcporter/mcporter.json > /tmp/m.json && mv /tmp/m.json ~/.mcporter/mcporter.json
```

(same for `chrome-devtools-proxy` with port 9223), then inside fabric:

```ts
await tools.call({ ref: "mcp.$reload" });
```

### 3c. Mirrored networking off

`C:\Users\e41q\.wslconfig` needs `[wsl2]` → `networkingMode=mirrored`, then
`wsl --shutdown` from Windows — **this kills the current WSL session**; do it
only with the user, at a natural break.

## Phase 4 — Smoke test

```ts
await mcp.chrome_devtools.list_pages({});   // any page list = success
```

First call may cold-start (~10s; `-32001` timeout → wait 8s, retry once).

## Phase 5 — If the smoke test failed

| Symptom | Likely cause | Fix |
|---|---|---|
| `Could not connect to Chrome` | instance down (port check failed) | Phase 3a |
| `MCP error -32001: Request timed out` | cold start / mb-profile restoring tabs | wait ~8s, retry; if persistent restart instance |
| `appears offline` / `Connection closed` | tab/process crashed | retry `list_pages`; Phase 3a |
| server missing from `$servers` | config not loaded | Phase 3b + `mcp.$reload` |
| port up but calls hang | wedged instance | kill via `taskkill.exe` and Phase 3a |
| `Cannot find module ... chrome-devtools-mcp` | npx cache corrupt | `rm -rf ~/.npm/_npx && npm cache clean --force` |

## Tuning the tool surface (server flags)

Trim tools in `~/.mcporter/mcporter.json` args (then `mcp.$reload`):

- `--slim` — radical: 3 tools (navigate, evaluate, screenshot)
- `--no-category-network` / `--no-category-performance` / `--no-category-emulation`
- `--screenshotFormat jpeg --screenshotMaxWidth 1280` — smaller screenshots
- `--experimentalVision` — enables `click_at(x, y)`

Confirm what's live: `tools.list({ provider: "mcp" })` or
`tools.describe({ ref: "mcp.chrome_devtools.<tool>" })` — always current.

## Uninstall / disable

```bash
jq 'del(.mcpServers["chrome-devtools"], .mcpServers["chrome-devtools-proxy"])' \
  ~/.mcporter/mcporter.json > /tmp/m.json && mv /tmp/m.json ~/.mcporter/mcporter.json
```

Then `tools.call({ ref: "mcp.$reload" })`. Chrome itself and the launcher
scripts stay (other things may depend on them).
