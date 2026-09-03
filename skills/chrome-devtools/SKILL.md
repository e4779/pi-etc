---
name: chrome-devtools
description: >
  Drive a real Chrome tab via the chrome-devtools MCP. Use when the user asks
  to scrape a website, test a frontend, click buttons, fill out or submit
  forms, log in, debug console errors, inspect network requests, take page
  screenshots, or measure page performance. Workflow: navigate, take a11y
  snapshots (every element gets a uid), click/fill/hover via uid, evaluate
  JS, read console & network, capture screenshots, run performance traces.
  Call `mcp.chrome_devtools.*` inside `fabric_exec` — type-checked, no CLI spawn.
---

# Chrome DevTools

Drive a real Chrome tab through the `chrome-devtools` MCP via Fabric's `mcp.*`
surface. All calls are type-checked TypeScript inside `fabric_exec` — no
`mcporter call` CLI, no process spawn.

## Prerequisites

```ts
// Smoke test — list pages (first call may time out on cold start, see Troubleshooting)
await mcp.chrome_devtools.list_pages({});
```

Missing or broken? See `<skill-dir>/references/setup.md` (inventory → repair →
smoke test).

## When to use

- Browser automation / scraping, front-end debugging, UI verification after code changes.
- Any task where you'd reach for Playwright/Puppeteer.

**Don't** use it for static HTML — `pi.read` the file. Chrome is for *live* /
JS-rendered pages.

## Core workflow

```
list_pages → select_page → navigate_page → take_snapshot → (act) → verify
```

### ⚠️ Seven times measure, once cut — check the schema before you call

> The stupidest question is the one you didn't ask. `tools.describe` is free,
> hallucinated args are not. A 2-second check beats a 20-minute debugging detour.

Before using **any** tool you haven't called in this session, check its live
schema — it is always more current than any static doc:

```ts
// One call, full schema: types, enums, defaults, required fields
await tools.describe({ ref: "mcp.chrome_devtools.take_screenshot" });
```

Do this especially after updating the MCP package — tools are added/renamed
between versions. The schema is the source of truth; this skill documents only
what the schema *cannot* tell you (gotchas, pi-specific wiring, behavioral traps).

1. **`take_snapshot`** is your eyes — the a11y tree with a `uid` per element.
   Prefer it over `take_screenshot` (text is cheaper and more precise than pixels).
2. **`uid`** from the snapshot addresses elements in `click` / `fill` / `hover`.
   Only a11y-tree elements get a uid — a plain `<span>` (even with `aria-label`)
   is invisible. Give decorative icons `role="img"` (or `role="button"`) so they
   can be targeted — this is also correct a11y.
3. After any action, re-snapshot — the uid prefix changes with EVERY new
   snapshot (not only on DOM change), so never reuse uids from an old snapshot.
   Pass `includeSnapshot: true` on click/fill to get the fresh tree in the same call.

### ⚠️ Use the semantic tool, not `evaluate_script`

`evaluate_script` is for **reading** state (DOM, styles, text, tables). For
**actions** — click, fill, scroll, hover — it is the *wrong* tool: slower (no
`includeSnapshot`), brittle (skips real event listeners), harder to debug.

| Want to… | ❌ Don't | ✅ Do |
|---|---|---|
| Click a button/link | `el.click()` in evaluate_script | `click({ uid: "1_5" })` |
| Type into a field | `el.value = 'x'` | `fill({ uid: "1_7", value: "x" })` |
| Fill a form | multiple `fill`s | `fill_form({ elements: [...] })` |
| Scroll the page | `window.scrollTo(...)` | `press_key({ key: "End" })` |
| Submit a form | `form.submit()` | `click` the submit button |
| Hover for a tooltip/menu | `dispatchEvent(...)` | `hover({ uid: "1_3" })` |
| Read N items / styles / text | — | **`evaluate_script` is correct here** |

## Top tools

All calls are `mcp.chrome_devtools.<tool>(args)` inside `fabric_exec`.

```ts
// Navigate — all page tools require pageId (get it from list_pages)
await mcp.chrome_devtools.navigate_page({ pageId: 1, type: "url", url: "https://example.com" });
await mcp.chrome_devtools.new_page({ url: "https://example.com" });
await mcp.chrome_devtools.navigate_page({ pageId: 1, type: "reload", ignoreCache: true });

// See — snapshot (a11y tree, primary view) or screenshot (colors/layout)
await mcp.chrome_devtools.take_snapshot({ pageId: 1 });
await mcp.chrome_devtools.take_snapshot({ pageId: 1, verbose: true });
const tmp = (await pi.bash({ cmd: "echo $TMPDIR" })).output.trim();
await mcp.chrome_devtools.take_screenshot({ pageId: 1, filePath: `${tmp}/page.png` });

// Interact (need a uid from a snapshot)
await mcp.chrome_devtools.click({ pageId: 1, uid: "1_5", includeSnapshot: true });
await mcp.chrome_devtools.fill({ pageId: 1, uid: "1_7", value: "hello" });
await mcp.chrome_devtools.fill_form({ pageId: 1, elements: [{ uid: "1_7", value: "user" }, { uid: "1_8", value: "pass" }] });
await mcp.chrome_devtools.hover({ pageId: 1, uid: "1_3" });
await mcp.chrome_devtools.press_key({ pageId: 1, key: "Enter" });
await mcp.chrome_devtools.wait_for({ pageId: 1, text: ["Welcome", "Error"] });

// Evaluate JS — read state, returns JSON.
// No `awaitPromise` argument (that's the Playwright API — it is rejected);
// to wait, RETURN a promise from the function; it will be awaited.
// Valid args: pageId, function, args, filePath, dialogAction, waitForStableDom.
await mcp.chrome_devtools.evaluate_script({ pageId: 1, function: "() => document.title" });
await mcp.chrome_devtools.evaluate_script({ pageId: 1, function: '() => fetch("/api/x").then(r => r.json()).then(j => ({ total: j.totalCount }))' });

// Pages
await mcp.chrome_devtools.list_pages({});
await mcp.chrome_devtools.select_page({ pageId: 2 });
await mcp.chrome_devtools.close_page({ pageId: 2 });
```

## Screenshots — where to save & how to read

> **Prefer `take_snapshot` for verification** — the a11y tree text is cheaper, more precise,
> and doesn't need a vision-capable model. Use screenshots only when you need to see
> colors/layout/visual regressions.

`take_screenshot` writes to `filePath`. **The path must be inside an allowed
workspace root**, otherwise you get `Access denied: path … is not within any of
the configured workspace roots`.

### Where to save

| Location | Works? | Notes |
|---|---|---|
| `"$TMPDIR"` | ✅ **default safe choice** | macOS `/var/folders/…/T/` — always allowed |
| `/tmp` | ❌ on macOS | canonical is `/private/tmp`, outside the root |
| project dir | ❌ by default | not a root unless configured |
| `~/.mcporter` | ❌ by default | not a root |

**Rule: always use `"$TMPDIR"`** (the OS temp dir). On macOS this is
`/var/folders/…/T/` — *not* `/tmp`.

```ts
const tmp = (await pi.bash({ cmd: "echo $TMPDIR" })).output.trim();

// Full page
await mcp.chrome_devtools.take_screenshot({ pageId: 1, filePath: `${tmp}/page.png` });
// One element (by uid from a snapshot)
await mcp.chrome_devtools.take_screenshot({ pageId: 1, uid: "1_5", filePath: `${tmp}/el.png` });
// Full scrollable page
await mcp.chrome_devtools.take_screenshot({ pageId: 1, fullPage: true, filePath: `${tmp}/full.png` });
// Smaller payload (jpeg + downscale)
await mcp.chrome_devtools.take_screenshot({ pageId: 1, format: "jpeg", quality: 70, filePath: `${tmp}/page.jpg` });
```

### How to view the screenshot

`pi.read` the file — but **only vision-capable models see images**. Non-vision
models (e.g. GLM-5.2) get `tool image omitted: model does not support images`.

> **If you can't see, ask someone who can.** Delegate to a vision-capable
> sub-agent (`pixso-analyst`, model Qwen3.8-27B) via `agents.ask`, or ask
> the user. Don't guess what a screenshot shows — either see it or have it
> described to you.

```ts
// You (vision model): pi.read directly
await pi.read({ path: `${tmp}/page.png` });

// You (non-vision): delegate to a seeing actor
await agents.ask({ id: "pixso-analyst", message: `Read ${tmp}/page.png and describe the layout` });

// For most verification, skip screenshots entirely — take_snapshot (a11y text)
// is sufficient and doesn't need vision.
```

### Element screenshots vs full page

`uid: "1_5"` screenshots **just that element** (clipped to its bounding box).
Without `uid`, you get the **current viewport**. `fullPage: true` captures the
entire scrollable page (incompatible with `uid`).

## Pitfalls

- **`get_network_request` truncates large response bodies** (~10KB observed of a
  29KB body). A field missing from the captured slice is NOT evidence it is
  absent — verify by re-fetching in page context:
  `evaluate_script` with `() => fetch(url).then(r => r.json()).then(j => j.field)`.
- **HMR staleness**: after editing frontend code, hard-reload
  (`navigate_page { type: "reload", ignoreCache: true }`) before measuring — HMR
  propagation to the open tab is unreliable, and measurements on the stale
  bundle give false "fix didn't work" conclusions.
- **DOM text probes false-negative on tooltips/popovers**: text nodes may have
  children, so `e.children.length === 0 && textContent === X` misses them. For
  "is text X rendered?" checks, trust the screenshot or scrollWidth metrics.
## When you need more

- **First-run setup** (mcporter/Chrome/config/daemon missing) → `pi.read({ path: "<skill-dir>/references/setup.md" })`
- **Tool schemas** → `tools.describe({ ref: "mcp.chrome_devtools.<tool>" })` — live, always current. Don't read static tool lists.
- **Cookbook workflows** (table scraping, lazy-load, login, SPA debug, perf trace) → `pi.read({ path: "<skill-dir>/references/recipes.md" })`

Load these only when the task needs them — that's the whole point.

## Anti-patterns

- ❌ `take_screenshot` to read text/DOM → use `take_snapshot` (cheaper, precise)
- ❌ `filePath=/tmp/…` on macOS → `Access denied` (canonical `/private/tmp` is outside the root). Use `"$TMPDIR"` → see Screenshots section
- ❌ Multiple `fill` calls for one form → use `fill_form` (one round-trip)
- ❌ Guessing selectors when you have a `uid` → snapshot first, use the uid
- ❌ **`evaluate_script` for actions** (`.click()`, `.value=`, `scrollTo`) → use `click` / `fill` / `press_key` (real events + snapshot)
- ❌ Fresh `evaluate_script` for colors/box-model → see the `chrome-css` skill
- ❌ First-call `MCP error -32001: Request timed out` → cold start, not a crash → wait ~8s and retry

## Troubleshooting

Most failures are cold starts or stale uids, not crashes. There is **no**
`mcp.$reload()` in the fabric build — the recovery is **wait and retry**.

| Symptom | Fix |
|---|---|
| `MCP error -32001: Request timed out` on first call after idle | cold start (`npx -y chrome-devtools-mcp@latest` + Chrome launch) → wait ~8s, retry; the server stays up afterwards |
| `appears offline` / `Connection closed` | tab/process crashed → retry `list_pages`; if persistent, see setup.md |
| `Element with uid … not found` | stale uid, or element missing from the a11y tree (add a `role`) → `take_snapshot` again, use the fresh uid |
| `Navigation timeout of 10000 ms exceeded` | slow site → retry `navigate_page` (often lands 2nd try); or raise `timeout` |
