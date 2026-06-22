---
name: chrome-devtools
description: >
  Drive a real Chrome tab via the chrome-devtools MCP. Use when the user asks
  to scrape a website, test a frontend, click buttons, fill out or submit
  forms, log in, debug console errors, inspect network requests, take page
  screenshots, or measure page performance. Workflow: navigate, take a11y
  snapshots (every element gets a uid), click/fill/hover via uid, evaluate
  JS, read console & network, capture screenshots, run performance traces.
  Wraps `mcporter call chrome-devtools.*` so the 29-tool schema (~18k tokens)
  stays out of context until needed.
allowed-tools: bash read
---

# Chrome DevTools

Drive a real Chrome tab through the `chrome-devtools` MCP via `mcporter call`.
The top tools cover ~90% of real tasks; the rest loads on demand.

See the [mcporter skill](../mcporter/SKILL.md) for mcporter basics (call syntax,
daemon, config, output control).

## Prerequisites

```bash
mcporter daemon status                                    # green?
mcporter call chrome-devtools.list_pages --output text    # prints a page → ready
```

Missing or broken? `read skills/chrome-devtools/references/setup.md` (inventory →
repair → smoke test). If calls fail with `appears offline` / `Connection
closed`, restart the daemon:

```bash
mcporter daemon restart && sleep 3
```

## When to use

- Browser automation / scraping, front-end debugging, UI verification after code changes.
- Any task where you'd reach for Playwright/Puppeteer.

**Don't** use it for static HTML — `read` the file. Chrome is for *live* /
JS-rendered pages.

## Core workflow

```
list_pages → select_page → navigate_page → take_snapshot → (act) → verify
```

1. **`take_snapshot`** is your eyes — the a11y tree with a `uid` per element.
   Prefer it over `take_screenshot` (text is cheaper and more precise than pixels).
2. **`uid`** from the snapshot addresses elements in `click` / `fill` / `hover`.
3. After any action, re-snapshot — uids change when the DOM changes. Pass
   `includeSnapshot=true` on click/fill to get the fresh tree in the same call.

### ⚠️ Use the semantic tool, not `evaluate_script`

`evaluate_script` is for **reading** state (DOM, styles, text, tables). For
**actions** — click, fill, scroll, hover — it is the *wrong* tool: slower (no
`includeSnapshot`), brittle (skips real event listeners), harder to debug.

| Want to… | ❌ Don't | ✅ Do |
|---|---|---|
| Click a button/link | `el.click()` in evaluate_script | `click uid=1_5` |
| Type into a field | `el.value = 'x'` | `fill uid=1_7 value=x` |
| Fill a form | multiple `fill`s | `fill_form --args '{"elements":[...]}'` |
| Scroll the page | `window.scrollTo(...)` | `press_key key=End` |
| Submit a form | `form.submit()` | `click` the submit button |
| Hover for a tooltip/menu | `dispatchEvent(...)` | `hover uid=1_3` |
| Read N items / styles / text | — | **`evaluate_script` is correct here** |

## Top tools

All calls use `mcporter call chrome-devtools.<tool> key=value ...`
(`key=value`, `key:value`, or `'tool(k: "v")'`).

```bash
# Navigate
mcporter call chrome-devtools.navigate_page type=url url=https://example.com
mcporter call chrome-devtools.new_page url=https://example.com
mcporter call chrome-devtools.navigate_page type=reload ignoreCache=true

# See — snapshot (a11y tree, primary view) or screenshot (colors/layout)
mcporter call chrome-devtools.take_snapshot
mcporter call chrome-devtools.take_snapshot verbose=true
mcporter call chrome-devtools.take_screenshot filePath=/tmp/page.png

# Interact (need a uid from a snapshot)
mcporter call chrome-devtools.click uid=1_5 includeSnapshot=true
mcporter call chrome-devtools.fill uid=1_7 value="hello"
mcporter call chrome-devtools.fill_form --args '{"elements":[{"uid":"1_7","value":"user"},{"uid":"1_8","value":"pass"}]}'
mcporter call chrome-devtools.hover uid=1_3
mcporter call chrome-devtools.press_key key=Enter
mcporter call chrome-devtools.wait_for --args '{"text":["Welcome","Error"]}'

# Evaluate JS — read state, returns JSON. First uid in --args becomes `el`.
mcporter call chrome-devtools.evaluate_script function='() => document.title'
mcporter call chrome-devtools.evaluate_script function='() => ({ h1: document.querySelector("h1")?.innerText, links: document.querySelectorAll("a").length })'
mcporter call chrome-devtools.evaluate_script function='(el) => el.innerText' --args '{"function":"(el) => el.innerText","args":["1_5"]}'

# Pages
mcporter call chrome-devtools.list_pages
mcporter call chrome-devtools.select_page pageId=2
mcporter call chrome-devtools.close_page pageId=2     # last open page can't close
```

For multi-statement logic, write a full body — `() => { ... return x; }`.

## When you need more

- **First-run setup** (mcporter/Chrome/config/daemon missing) → `read skills/chrome-devtools/references/setup.md`
- **All 29 tools + full signatures** (console, network, performance, memory, emulation, and more) **and server-flag tuning** (`--slim`, `--no-category-*`) → `read skills/chrome-devtools/references/tools.md`
- **Cookbook workflows** (table scraping, lazy-load, login, SPA debug, perf trace) → `read skills/chrome-devtools/references/recipes.md`

Load these only when the task needs them — that's the whole point.

## Anti-patterns

- ❌ `take_screenshot` to read text/DOM → use `take_snapshot` (cheaper, precise)
- ❌ Multiple `fill` calls for one form → use `fill_form` (one round-trip)
- ❌ Guessing selectors when you have a `uid` → snapshot first, use the uid
- ❌ **`evaluate_script` for actions** (`.click()`, `.value=`, `scrollTo`) → use `click` / `fill` / `press_key` (real events + snapshot)
- ❌ Fresh `evaluate_script` for colors/box-model → see the `chrome-css` skill
- ❌ Calling tools when the daemon is down → check `mcporter daemon status` first

## Troubleshooting

The fix for ~80% of real failures is the same: **restart the daemon** (Chrome is
the flaky part, not the MCP).

| Symptom | Fix |
|---|---|
| `appears offline` / `Connection closed` | tab/process crashed → `mcporter daemon restart && sleep 3` |
| `Element with uid … not found` | DOM changed since snapshot → `take_snapshot` again, use the fresh uid |
| `Navigation timeout of 10000 ms exceeded` | slow site → retry `navigate_page` (often lands 2nd try); or raise `timeout=` |

Setup/boot failures (`mcporter: command not found`, daemon won't start,
`Target closed`, `Cannot find module`) are diagnosed in `references/setup.md` → Phase 5.
