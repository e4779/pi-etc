# Chrome DevTools — Full Tool Reference

> **Read on demand.** This file lists every tool the chrome-devtools MCP can expose.
> You don't need it for the common 90% — the top tools live in `../SKILL.md`.
> Load this when a task needs console, network, performance, memory, emulation,
> or you want the exact parameter list for something unusual.

## Tool surface is version- and flag-dependent

The set of tools depends on the installed `chrome-devtools-mcp` version **and**
the launch flags. A vanilla recent install exposes ~29 tools; enabling
experimental flags or upgrading adds more (Memory, Extensions, click_at, screencast…).

**Always confirm what's actually live on your box:**

```bash
mcporter list chrome-devtools --brief     # names only, fast
mcporter list chrome-devtools --schema    # full params (large output)
```

If a tool below is missing, either upgrade (`chrome-devtools-mcp@latest`) or
enable its flag in `~/.mcporter/mcporter.json` (see [Tuning the tool
surface](#tuning-the-tool-surface-server-flags) below). If a tool exists on your box but isn't listed here, trust
`mcporter list` — this doc may lag behind upstream.

All calls: `mcporter call chrome-devtools.<tool> key=value ...`

---

## Tuning the tool surface (server flags)

The MCP ships more tools than most tasks need. Trim it in `~/.mcporter/mcporter.json`
(then `mcporter daemon restart`):

- **`--slim`** — radical: just 3 tools (`navigate`, `evaluate`, `screenshot`). Best for pure scraping.
- **`--no-category-network` / `--no-category-performance` / `--no-category-emulation`** — granular: drop whole categories you don't use, keep the rest.
- **`--screenshotFormat jpeg --screenshotMaxWidth 1280`** — smaller screenshots = less context.
- **`--experimentalVision`** — enables `click_at(x, y)` (coordinate clicks, no uid needed; needs a vision-capable model).

Confirm what's live with `mcporter list chrome-devtools --brief`.

---

## Input automation

Interact with elements. **All need a `uid`** from `take_snapshot` (unless noted).

### `click` — click an element
```bash
mcporter call chrome-devtools.click uid=1_5
mcporter call chrome-devtools.click uid=1_5 dblClick=true includeSnapshot=true
```
| param | type | req | notes |
|---|---|---|---|
| `uid` | string | ✓ | from snapshot |
| `dblClick` | bool | | double click |
| `includeSnapshot` | bool | | return fresh snapshot (saves a round-trip) |

### `fill` — fill one input/select/checkbox
```bash
mcporter call chrome-devtools.fill uid=1_7 value=hello
mcporter call chrome-devtools.fill uid=1_9 value=true    # checkbox/radio
```
| param | type | req | notes |
|---|---|---|---|
| `uid` | string | ✓ | |
| `value` | string | ✓ | `"true"`/`"false"` for checkbox/toggle, `"true"` for radio |
| `includeSnapshot` | bool | | |

### `fill_form` — fill a whole form in ONE call *(preferred over multiple `fill`)*
```bash
mcporter call chrome-devtools.fill_form --args '{
  "elements": [
    {"uid":"1_7","value":"alice"},
    {"uid":"1_8","value":"hunter2"},
    {"uid":"1_9","value":"true"}
  ],
  "includeSnapshot": true
}'
```
| param | type | req | notes |
|---|---|---|---|
| `elements` | array | ✓ | each `{uid, value}` |
| `includeSnapshot` | bool | | |

### `hover`
```bash
mcporter call chrome-devtools.hover uid=1_3
```

### `drag`
```bash
mcporter call chrome-devtools.drag from_uid=1_3 to_uid=1_8
```

### `press_key` — keyboard shortcut or special key
```bash
mcporter call chrome-devtools.press_key key=Enter
mcporter call chrome-devtools.press_key key=Control+A
mcporter call chrome-devtools.press_key key=Control+Shift+R
```
Modifiers: `Control`, `Shift`, `Alt`, `Meta`.

### `type_text` — type into the currently focused input
```bash
mcporter call chrome-devtools.type_text text="hello" submitKey=Enter
```
Use when the input is already focused (e.g. after `click`). Prefer `fill` when
you have a `uid` — it's more reliable.

### `upload_file`
```bash
mcporter call chrome-devtools.upload_file uid=1_4 filePath=/tmp/avatar.png
```

### `handle_dialog` — accept/dismiss `alert()`/`confirm()`/`prompt()`
```bash
mcporter call chrome-devtools.handle_dialog action=accept
mcporter call chrome-devtools.handle_dialog action=dismiss
mcporter call chrome-devtools.handle_dialog action=accept promptText="yes"
```

### `click_at` *(only with `--experimentalVision`)* — click by coordinates
```bash
mcporter call chrome-devtools.click_at x=420 y=315
```
For vision-capable models that produce coordinates from a screenshot. Needs
`--experimentalVision` flag on the server.

---

## Navigation & pages

### `navigate_page`
```bash
mcporter call chrome-devtools.navigate_page type=url url=https://example.com
mcporter call chrome-devtools.navigate_page type=reload ignoreCache=true
mcporter call chrome-devtools.navigate_page type=back
mcporter call chrome-devtools.navigate_page type=forward
```
Optional: `handleBeforeUnload=accept|decline`, `initScript=<js>`, `timeout=<ms>`.

### `new_page` — open a new tab
```bash
mcporter call chrome-devtools.new_page url=https://example.com
mcporter call chrome-devtools.new_page url=https://example.com background=true
mcporter call chrome-devtools.new_page url=... isolatedContext=demo
```
`isolatedContext` = separate cookies/storage by name.

### `list_pages` / `select_page` / `close_page`
```bash
mcporter call chrome-devtools.list_pages
mcporter call chrome-devtools.select_page pageId=2 bringToFront=true
mcporter call chrome-devtools.close_page pageId=2     # last open page can't close
```

### `wait_for` — block until text appears
```bash
mcporter call chrome-devtools.wait_for --args '{"text":["Welcome","Error"]}'
mcporter call chrome-devtools.wait_for --args '{"text":["Done"],"timeout":15000}'
```
Resolves when **any** of the strings appears. Great for SPA navigations /
async renders. Pair with `list_console_messages` to detect errors.

---

## Snapshot & screenshot

### `take_snapshot` — a11y tree with uids *(THE primary view)*
```bash
mcporter call chrome-devtools.take_snapshot
mcporter call chrome-devtools.take_snapshot verbose=true
mcporter call chrome-devtools.take_snapshot filePath=/tmp/snap.txt
```
Prefer this over `take_screenshot` — text is cheaper and more precise than
pixels. `verbose=true` dumps the full a11y tree (only when basic lacks detail).

### `take_screenshot`

> **Path restriction:** `filePath` must be inside an allowed workspace root.
On macOS, **use `"$TMPDIR"`** (`/var/folders/…/T/`), not `/tmp` — `/tmp` resolves
to `/private/tmp` which is outside the default root and gives `Access denied`.
See `../SKILL.md` → Screenshots for details.

```bash
mcporter call chrome-devtools.take_screenshot filePath="$TMPDIR/p.png"
mcporter call chrome-devtools.take_screenshot uid=1_5 filePath="$TMPDIR/el.png"    # one element
mcporter call chrome-devtools.take_screenshot fullPage=true filePath="$TMPDIR/full.png"
mcporter call chrome-devtools.take_screenshot format=jpeg quality=70 filePath="$TMPDIR/p.jpg"
```
| param | type | notes |
|---|---|---|
| `format` | `png`\|`jpeg`\|`webp` | default `png` |
| `quality` | 0–100 | jpeg/webp only |
| `uid` | string | element screenshot (incompatible with `fullPage`) |
| `fullPage` | bool | whole scrollable page |
| `filePath` | string | save to file instead of inline image |

> Tip: `jpeg` + `quality=70` is 3–5× smaller than PNG → less context.

### `screencast_start` / `screencast_stop` *(needs `--experimentalScreencast` + ffmpeg)*
Record a video of the tab. Exotic; check `mcporter list` for current params.

---

## Evaluation — for *reading* page state

### `evaluate_script` — run JS in the page, return JSON

> **Scope:** use `evaluate_script` to **read** DOM/styles/text/tables/cookies.
> For **actions** (click, fill, scroll, hover) use the dedicated tools — they
> fire real trusted events and return a snapshot. See SKILL.md → "Use the
> semantic tool".
```bash
# No args
mcporter call chrome-devtools.evaluate_script function='() => document.title'

# Object return
mcporter call chrome-devtools.evaluate_script function='() => ({ h1: document.querySelector("h1")?.innerText, n: document.querySelectorAll("a").length })'

# Element arg — first uid becomes `el`
mcporter call chrome-devtools.evaluate_script \
  function='(el) => ({ text: el.innerText, color: getComputedStyle(el).color })' \
  --args '{"function":"(el) => ({ text: el.innerText, color: getComputedStyle(el).color })","args":["1_5"]}'

# Multi-statement: use a full body
mcporter call chrome-devtools.evaluate_script function='() => { const items = document.querySelectorAll(".item"); return { count: items.length, first: items[0]?.textContent }; }'

# Save large output to file instead of inline
mcporter call chrome-devtools.evaluate_script function='() => document.body.innerHTML' filePath=/tmp/dom.html

# Handle window.alert() during eval
mcporter call chrome-devtools.evaluate_script function='() => alert("hi")' dialogAction=accept
```
| param | type | req | notes |
|---|---|---|---|
| `function` | string | ✓ | JS function declaration |
| `args` | string[] | | uids; become `el0`, `el1`, … in order |
| `filePath` | string | | save output to file (for big payloads) |
| `dialogAction` | string | | `accept`\|`dismiss`\|string (prompt response) |

For getComputedStyle / box-model / batch-style recipes, see the **`chrome-css`**
skill (if installed) for ready-made patterns.

---

## Console & network inspection

### `list_console_messages`
```bash
mcporter call chrome-devtools.list_console_messages
mcporter call chrome-devtools.list_console_messages types=error,warn
mcporter call chrome-devtools.list_console_messages pageSize=50 pageIdx=0
mcporter call chrome-devtools.list_console_messages includePreservedMessages=true   # last 3 navs
```
| param | type | notes |
|---|---|---|
| `types` | array | `log`,`debug`,`info`,`error`,`warn`,`dir`,`table`,`trace`,… |
| `pageSize`, `pageIdx` | int | pagination |
| `includePreservedMessages` | bool | keep messages across last 3 navigations |
| `serviceWorkerId` | string | filter by SW |

### `get_console_message` — full detail by id
```bash
mcporter call chrome-devtools.get_console_message msgid=12
```
Get `msgid` from `list_console_messages`.

### `list_network_requests`
```bash
mcporter call chrome-devtools.list_network_requests
mcporter call chrome-devtools.list_network_requests resourceTypes=fetch,xhr
mcporter call chrome-devtools.list_network_requests pageSize=20 pageIdx=0
mcporter call chrome-devtools.list_network_requests includePreservedRequests=true
```
`resourceTypes`: `document`,`stylesheet`,`image`,`script`,`xhr`,`fetch`,`websocket`,`preflight`,…

### `get_network_request` — bodies by id
```bash
mcporter call chrome-devtools.get_network_request reqid=42
mcporter call chrome-devtools.get_network_request reqid=42 requestFilePath=/tmp/req.body responseFilePath=/tmp/res.body
```
Saving bodies to files avoids dumping large payloads into context.

---

## Performance & Lighthouse

### `performance_start_trace` / `performance_stop_trace` / `performance_analyze_insight`
```bash
# 1. Navigate first (trace reloads the page by default)
mcporter call chrome-devtools.navigate_page type=url url=https://example.com

# 2. Record (autoStops by default after page load)
mcporter call chrome-devtools.performance_start_trace
# … or manual:
mcporter call chrome-devtools.performance_start_trace reload=true autoStop=false
mcporter call chrome-devtools.performance_stop_trace filePath=/tmp/trace.json.gz

# 3. Dig into an insight set (id comes from stop_trace output)
mcporter call chrome-devtools.performance_analyze_insight insightSetId=set_1 insightName=LCPBreakdown
```
Captures Core Web Vitals (LCP, INP, CLS) and a list of insights. Trace files
can be huge — always `filePath=` them.

### `lighthouse_audit` — accessibility / SEO / best practices
```bash
mcporter call chrome-devtools.lighthouse_audit                         # defaults
mcporter call chrome-devtools.lighthouse_audit mode=snapshot device=mobile
mcporter call chrome-devtools.lighthouse_audit outputDirPath=/tmp/lh
```
| param | type | notes |
|---|---|---|
| `mode` | `navigation`\|`snapshot` | `navigation` reloads & audits; `snapshot` = current state |
| `device` | `desktop`\|`mobile` | |
| `outputDirPath` | string | where to write reports |

> For performance audits use `performance_start_trace`, **not** `lighthouse_audit`
> (it explicitly excludes perf).

---

## Emulation

### `emulate` — throttle network/CPU, spoof UA / geolocation / viewport / dark mode
```bash
mcporter call chrome-devtools.emulate networkConditions="Slow 3G"
mcporter call chrome-devtools.emulate cpuThrottlingRate=4
mcporter call chrome-devtools.emulate colorScheme=dark
mcporter call chrome-devtools.emulate userAgent="Mozilla/5.0 (Mobile)"
mcporter call chrome-devtools.emulate viewport=375x812x3,mobile,touch
mcporter call chrome-devtools.emulate geolocation=37.7749,-122.4194
mcporter call chrome-devtools.emulate extraHttpHeaders='{"X-Test":"1"}'
```
Omit a param (or pass empty for UA/headers) to clear it.

### `resize_page`
```bash
mcporter call chrome-devtools.resize_page width=1280 height=720
```

---

## Memory debugging *(needs `--memoryDebugging`)*

Nine tools for heap analysis — only loaded with `--memoryDebugging` /
`--experimentalMemory`. Workflow:

```bash
mcporter call chrome-devtools.take_heapsnapshot filePath=/tmp/snap.heapsnapshot
mcporter call chrome-devtools.get_heapsnapshot_summary       # overview
mcporter call chrome-devtools.get_heapsnapshot_details ...   # drill into a class
mcporter call chrome-devtools.get_heapsnapshot_retainers ...
# …etc
```

Enable once via `args` in `~/.mcporter/mcporter.json`:
`["chrome-devtools-mcp@latest","--memoryDebugging","--headless","--executablePath","/snap/bin/chromium"]`,
then `mcporter daemon restart`. Check `mcporter list chrome-devtools --brief`
for the exact names/params on your version.

---

## Extensions *(opt-in `--categoryExtensions`)*

Install/list/reload/uninstall/trigger Chrome extensions. Niche; only loaded with
`--categoryExtensions=true`. Needs Chrome 149+ and a pipe connection (no
`--browserUrl`/`--autoConnect`). Run `mcporter list chrome-devtools` for current
signatures.

---

## Third-party & WebMCP *(experimental, opt-in)*

- `--categoryExperimentalThirdParty` → `list_3p_developer_tools`, `execute_3p_developer_tool`
  (tools the *page itself* exposes).
- `--categoryExperimentalWebmcp` → `list_webmcp_tools`, `execute_webmcp_tool`
  (Chrome 149+, needs `--enable-features=WebMCP,DevToolsWebMCPSupport`).

Both are bleeding edge. Confirm with `mcporter list` before relying on them.

---

## See also

- `../SKILL.md` — top tools + core workflow (read this first if you haven't)
- `recipes.md` — worked end-to-end scenarios
- `chrome-css` skill (if installed) — getComputedStyle / box-model patterns
- `layout-check` skill (if installed) — pairwise layout verification via coordinates
