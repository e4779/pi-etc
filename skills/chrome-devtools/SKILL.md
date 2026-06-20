---
name: chrome-devtools
description: Drive a real Chrome tab via the chrome-devtools MCP — navigate, take a11y snapshots, click/fill elements, evaluate JS, inspect console & network, screenshots, performance traces. Use for any browser automation, web scraping, front-end debugging, or UI verification. Wraps `mcporter call chrome-devtools.*` so the 29-tool schema (~18k tokens) stays out of context until needed.
allowed-tools: bash read
---

# Chrome DevTools

Drive a real Chrome tab through the `chrome-devtools` MCP via `mcporter call`.
No schema bloat: this skill keeps the 29-tool surface out of context and teaches
the few calls + workflows you actually need.

## Prerequisites

You need four things: `mcporter` CLI, a Chrome/Chromium binary, a
`chrome-devtools` entry in `~/.mcporter/mcporter.json`, and a running daemon.

**Quick check** — if this prints a page list, you're done:
```bash
mcporter daemon status
mcporter call chrome-devtools.list_pages --output text
```

If anything is missing or broken, follow the **first-run setup guide**:
```
read skills/chrome-devtools/references/setup.md
```
It walks through inventory → repair → smoke test (cross-platform Linux/macOS/Windows,
idempotent, same pattern as the `doctor` skill).

If everything was green and calls suddenly fail with `Connection closed` or
`appears offline`, the tab crashed — **restart the daemon** and retry:
```bash
mcporter daemon restart && sleep 3
```

> **Frozen tabs / heavy Chrome:** chrome-devtools-mcp *forces every tab to load*.
If Chrome has many tabs open it may OOM-crash. Close tabs you don't need, or
> connect to a dedicated Chrome instance via `--browser-url` (see recipes.md).

### Tuning the tool surface (token savings)

The MCP ships far more tools than most tasks need. Trim it in
`~/.mcporter/mcporter.json` (then `mcporter daemon restart`):

- **`--slim`** — radical: just 3 tools (`navigate`, `evaluate`, `screenshot`). Best for pure scraping.
- **`--no-category-network` / `--no-category-performance` / `--no-category-emulation`** — granular: drop whole categories you don't use, keep the rest.
- **`--screenshotFormat jpeg --screenshotMaxWidth 1280`** — smaller screenshots = less context.
- **`--experimentalVision`** — enables `click_at(x, y)` (coordinate clicks, no uid needed; needs a vision-capable model).

Confirm what's live with `mcporter list chrome-devtools --brief`.

## When to use

- Browser automation / scraping (navigate, read DOM, click, fill forms)
- Front-end debugging (console errors, network requests, computed styles)
- UI verification after code changes (snapshot diff, screenshot)
- Any task where you'd reach for Playwright/Puppeteer

**Do NOT use** for static HTML analysis — `read` the file instead. Chrome is for
*live* pages and JS-rendered content.

## Core workflow

Every browser task follows this loop:

```
list_pages → select_page → navigate_page → take_snapshot → (act) → verify
```

1. **`take_snapshot`** is your eyes — it returns the a11y tree with `uid` for every element.
   Prefer it over `take_screenshot` (text is cheaper and more precise than pixels).
2. **`uid`** from the snapshot is how you address elements in `click` / `fill` / `hover`.
3. After any action, either pass `includeSnapshot=true` (click/fill return a fresh snapshot)
   or call `take_snapshot` again — uids change when the DOM changes.

## Top tools (covers ~90% of tasks)

All calls use `mcporter call chrome-devtools.<tool> key=value ...`.
Key syntax: `key=value`, `key:value`, or function-call `'tool(k: "v")'`.

### Navigate

```bash
# Open URL in current tab
mcporter call chrome-devtools.navigate_page type=url url=https://example.com

# New tab
mcporter call chrome-devtools.new_page url=https://example.com

# Reload (optionally bypass cache)
mcporter call chrome-devtools.navigate_page type=reload ignoreCache=true
```

### See the page

```bash
# a11y tree with uids — THE primary view
mcporter call chrome-devtools.take_snapshot

# Verbose (full a11y info) — only when basic snapshot lacks detail
mcporter call chrome-devtools.take_snapshot verbose=true

# Screenshot to file (for colors/visual layout, not for structure)
mcporter call chrome-devtools.take_screenshot filePath=/tmp/page.png
mcporter call chrome-devtools.take_screenshot fullPage=true filePath=/tmp/full.png
```

### Interact (need a `uid` from snapshot)

```bash
mcporter call chrome-devtools.click uid=1_5
mcporter call chrome-devtools.click uid=1_5 dblClick=true includeSnapshot=true

# Single field
mcporter call chrome-devtools.fill uid=1_7 value="hello"

# Whole form in ONE call — ALWAYS prefer over multiple fill
mcporter call chrome-devtools.fill_form --args '{"elements":[{"uid":"1_7","value":"user"},{"uid":"1_8","value":"pass"}]}'

mcporter call chrome-devtools.hover uid=1_3
mcporter call chrome-devtools.press_key key=Enter
mcporter call chrome-devtools.wait_for --args '{"text":["Welcome","Error"]}'
```

### Evaluate JavaScript (the swiss-army knife)

One tool replaces dozens. Returns JSON. Use for anything not covered above:
read text/styles/attrs, count elements, extract data, call page APIs.

```bash
# No args
mcporter call chrome-devtools.evaluate_script function='() => document.title'

# Read structured data from the page
mcporter call chrome-devtools.evaluate_script function='() => ({ title: document.title, h1: document.querySelector("h1")?.innerText, links: document.querySelectorAll("a").length })'

# Element arg: first uid becomes el
mcporter call chrome-devtools.evaluate_script function='(el) => getComputedStyle(el).color' --args '{"function":"(el) => getComputedStyle(el).color","args":["1_5"]}'
```

Tip: for multi-statement logic, write a full function body — `() => { ... return x; }`.

### Pages management

```bash
mcporter call chrome-devtools.list_pages
mcporter call chrome-devtools.select_page pageId=2
mcporter call chrome-devtools.close_page pageId=2      # last page can't close
mcporter call chrome-devtools.resize_page width=1280 height=720
```

## When you need more

This file covers the common 90%. For the rest, **read on demand**:

- **First-run setup** (mcporter/Chrome/config/daemon not in place) → `read skills/chrome-devtools/references/setup.md`
- **All 29 tools with full signatures** → `read skills/chrome-devtools/references/tools.md`
  (console messages, network requests, performance traces, heap snapshots, emulation, drag, upload, dialogs)
- **Cookbook workflows** (table scraping, lazy-load, login, SPA debug, perf trace — drawn from real scraping sessions) → `read skills/chrome-devtools/references/recipes.md`

Don't load these unless the task actually needs them — that's the whole point.

## Anti-patterns

- ❌ `take_screenshot` to read text/DOM → use `take_snapshot` (cheaper, precise)
- ❌ Multiple `fill` calls for one form → use `fill_form` (one round-trip)
- ❌ Guessing selectors when you have `uid` → snapshot first, use the uid
- ❌ Writing a fresh `evaluate_script` for colors/box-model → see `chrome-css` skill for ready patterns
- ❌ Calling tools when daemon is down → check `mcporter daemon status` first

## Troubleshooting

The fix for ~80% of real failures is the same: **restart the daemon**. Chrome
is the flaky part, not the MCP.

| Symptom (error codes from real session logs) | Fix |
|---|---|
| `appears offline` / `MCP error -32000: Connection closed` | Chrome tab/process crashed → `mcporter daemon restart && sleep 3` |
| `MCP error -32001: Request timed out` | slow page or hung tab → retry; persistent → restart daemon |
| `Navigation timeout of 10000 ms exceeded` | slow site → retry `navigate_page` (often lands 2nd try); or raise `timeout=` |
| `Element with uid … not found` | DOM changed since snapshot → `take_snapshot` again, use fresh uid |
| `Expected array, received string` | array param passed as `key=a,b` → use `--args '{"k":["a","b"]}'` |
| Tool feels wrong / want full param list | `read skills/chrome-devtools/references/tools.md` |
| Daemon not running | `mcporter daemon start` |
| `mcporter: command not found` | `npm i -g mcporter`, then configure chrome-devtools server |
