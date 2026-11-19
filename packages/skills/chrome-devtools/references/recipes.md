# Chrome DevTools — Recipes

> **Read on demand.** Worked scenarios using fabric natives
> (`mcp.chrome_devtools.*` inside `fabric_exec`). The core workflow is in
> `../SKILL.md`; live schemas via `tools.describe({ ref: "mcp.chrome_devtools.<tool>" })`.

**These recipes come from real sessions** (financial-data scraping: finam.ru,
MOEX, dohod.ru, ЦБ РФ, FRED). Usage frequency across ~1300 recorded calls:

| tool | calls | |
|---|---|---|
| `navigate_page` | 482 | most-used by far |
| `evaluate_script` | 290 | the swiss-army knife |
| `take_snapshot` | 241 | primary "eyes" |
| everything else | ~300 | |

`navigate` + `evaluate` + `snapshot` cover ~73% of real usage — that's why
`SKILL.md` teaches just those three first.

## Conventions

- **Every page tool requires `pageId`** — get it from `list_pages` / `new_page`.
  Examples below assume `const pageId = …` is already bound.
- Every interaction starts from a fresh `take_snapshot` — **uids change when the
  DOM changes**. Don't reuse a uid across navigation or dynamic updates.
- Arrays and objects are plain TS values now — no `--args` JSON quoting:
  `list_console_messages({ pageId, types: ["error", "warn"] })`.
- `includeSnapshot: true` on click/fill/hover returns a fresh snapshot in the
  same response — saves a round-trip.
- First call after idle may cold-start (`-32001` timeout) → wait ~8s, retry.

---

## Recipe 1 — Scrape a data table out of a page

> *Pattern observed 5+ times parsing БПИФ / MOEX report tables.*

Most real pages don't give you clean JSON — the data is in a `<table>` you have
 to walk. Three variants, cheapest first.

### Variant A — count + sanity-check before extracting
Don't dump a huge table blind. Probe structure first:
```ts
await mcp.chrome_devtools.evaluate_script({ pageId, function: `() => {
  const tables = [...document.querySelectorAll("table")];
  return {
    tableCount: tables.length,
    rowsPerTable: tables.map(t => t.rows.length),
    h2: [...document.querySelectorAll("h2")].map(h => h.textContent.trim())
  };
}` });
```
Tells you which table index holds your data (e.g. "the report table is `tables[1]`").

### Variant B — extract one table as a matrix
```ts
await mcp.chrome_devtools.evaluate_script({ pageId, function: `() => {
  const tables = [...document.querySelectorAll("table")];
  const report = tables[1];                         // index from Variant A
  if (!report) return { error: "no report table", tableCount: tables.length };
  const rows = [...report.querySelectorAll("tr")].slice(1).map(tr =>
    [...tr.querySelectorAll("td")].map(td => td.textContent.trim())
  );
  return { rows, rowCount: rows.length };
}` });
```
Returns `rows` as an array-of-arrays — ready to format as CSV/TOON.

### Variant C — table summary (when you only need shape + edges)
```ts
await mcp.chrome_devtools.evaluate_script({ pageId, function: `() => {
  const t = document.querySelector(".tilt-table");
  if (!t) return "no tilt-table";
  return {
    rows: t.rows.length,
    cols: t.rows[0]?.cells.length ?? 0,
    firstRow: [...t.rows[0].cells].map(c => c.textContent.trim()),
    lastRow:  [...t.rows.at(-1).cells].map(c => c.textContent.trim())
  };
}` });
```
Cheaper than Variant B — read first/last row to confirm it's the right table,
then decide if you need the full dump.

---

## Recipe 2 — Extract a section between two headings

> *Real use: pull "Шаг 2: …" block out of a long regulatory document.*

When content lives between `<h2>`s, walk `nextElementSibling` until you hit the
next heading:
```ts
await mcp.chrome_devtools.evaluate_script({ pageId, function: `() => {
  let el = document.querySelector("h2");
  while (el && !el.textContent.includes("Шаг 2")) el = el.nextElementSibling;
  if (!el) return "not found";
  const section = el.parentElement;
  const rows = [...section.querySelectorAll(".tilt-table tbody tr, table tr")]
    .map(r => [...r.querySelectorAll("td,th")].map(c => c.textContent.trim()).join(" | "))
    .filter(Boolean);
  return rows.join("\n");
}` });
```

---

## Recipe 3 — Trigger lazy-loaded content (scroll, click "load more")

> *Real use: infinite-scroll lists on dohod.ru / MOEX history.*

Many pages load rows as you scroll. Scroll with `press_key` (fires real scroll
events; JS `scrollTo` can be detected-and-blocked by some SPAs), wait, re-measure:
```ts
// 1. Scroll down — End jumps to bottom, PageDown steps. Use what fits the page.
await mcp.chrome_devtools.press_key({ pageId, key: "End" });

// 2. Wait for the fetch to land
await new Promise(r => setTimeout(r, 1000));

// 3. Re-count; repeat until the count stops growing (reading is a legit evaluate use)
await mcp.chrome_devtools.evaluate_script({ pageId,
  function: "() => document.querySelectorAll('.item').length" });
```

For a **"Load more" button** — click the button by `uid` (not via JS), then wait:
```ts
await mcp.chrome_devtools.take_snapshot({ pageId });   // find the button uid
await mcp.chrome_devtools.click({ pageId, uid: "1_9" });
await mcp.chrome_devtools.wait_for({ pageId,
  text: ["Loading", "More", "End of list"] });
```
For a batch of identical "load more" buttons, loop with `click` (each by uid) —
not a single `evaluate_script` that calls `.click()` in a loop. The dedicated
`click` fires real trusted events that SPAs listen for; synthetic clicks via
`evaluate_script` silently fail on frameworks that check `event.isTrusted`.

---

## Recipe 4 — Investigate before interacting

> *The single most-repeated pattern. Always inspect page state first.*

Before filling a form, clicking, or scraping, probe the page cheaply:
```ts
await mcp.chrome_devtools.evaluate_script({ pageId, function: `() => ({
  url: location.href,
  title: document.title,
  ready: document.readyState,
  compatMode: document.compatMode,           // "CSS1Compat" or "BackCompat" (quirks)
  forms: document.forms.length,
  buttons: document.querySelectorAll("button").length,
  inputs: document.querySelectorAll("input").length,
  h1: document.querySelector("h1")?.innerText,
  subtitle: document.querySelector(".subtitle")?.textContent?.trim() || "none",
  errors: [...document.querySelectorAll("[role=alert],.error,.invalid")]
            .map(e => e.innerText).slice(0,5)
})` });
```
`compatMode: "BackCompat"` in particular explains a *lot* of "why does the
layout look wrong" bugs (page is in quirks mode).

---

## Recipe 5 — Read page text without dumping the whole DOM

> *Real use: quick "what's actually visible" check.*

`document.body.innerText` gives rendered text (no HTML noise). Always **slice**
it — full innerText of a long page blows up context:
```ts
// First 3000 chars — enough to identify the page
await mcp.chrome_devtools.evaluate_script({ pageId,
  function: "() => document.body.innerText.slice(0, 3000)" });

// Too big? save to a file and pi.read it only if needed
await mcp.chrome_devtools.evaluate_script({ pageId,
  function: "() => document.body.innerText", filePath: "/tmp/page.txt" });
```

---

## Recipe 6 — Find downloadable files (PDFs, videos, data)

> *Real use: locating PDF reports and video sources on a page.*

### PDF / link harvest
```ts
await mcp.chrome_devtools.evaluate_script({ pageId, function: `() => {
  const links = document.querySelectorAll("a");
  return [...links].filter(a => a.href.includes(".pdf")).map(a => a.href).slice(0, 10);
}` });
```

### Video / media (with fallback)
```ts
await mcp.chrome_devtools.evaluate_script({ pageId, function: `() => {
  const results = [];
  document.querySelectorAll("video").forEach(v => results.push({
    src: v.src, currentSrc: v.currentSrc, poster: v.poster, readyState: v.readyState
  }));
  document.querySelectorAll("source").forEach(s => results.push({ src: s.src, type: s.type }));
  if (results.length === 0) {
    // fallback: any element whose src mentions media formats
    document.querySelectorAll("*").forEach(el => {
      const src = el.getAttribute("src");
      if (src && (src.includes("mp4") || src.includes("m3u8") || src.includes("video")))
        results.push({ tag: el.tagName, src });
    });
  }
  return JSON.stringify(results.slice(0, 20));
}` });
```

---

## Recipe 7 — Login flow with validation

```ts
// 1. Navigate to the login page
await mcp.chrome_devtools.navigate_page({ pageId, type: "url",
  url: "https://app.example.com/login" });

// 2. Snapshot to find the form fields
await mcp.chrome_devtools.take_snapshot({ pageId });
// → note uids: 1_3 = username, 1_4 = password, 1_5 = submit

// 3. Fill the whole form in ONE call (faster than two `fill`s)
await mcp.chrome_devtools.fill_form({ pageId, elements: [
  { uid: "1_3", value: "alice@example.com" },
  { uid: "1_4", value: "correct horse battery staple" },
] });

// 4. Click submit (return fresh snapshot in the same call)
await mcp.chrome_devtools.click({ pageId, uid: "1_5", includeSnapshot: true });

// 5. Wait for a success/failure indicator
await mcp.chrome_devtools.wait_for({ pageId,
  text: ["Dashboard", "Welcome", "Invalid", "Log in"] });
```
**If it failed:** step 5 matches `"Invalid"` / `"Log in"`. Read cookies to debug
the session:
```ts
await mcp.chrome_devtools.evaluate_script({ pageId,
  function: "() => document.cookie" });
```
**Skip re-login next time** — drive a real Chrome profile via `--browserUrl`
(Recipe 9) so cookies/2FA persist.

---

## Recipe 8 — Debug a SPA (console errors + failing API calls)

```ts
await mcp.chrome_devtools.navigate_page({ pageId, type: "url",
  url: "https://app.example.com/dashboard" });

// SPA: snapshot is empty right after nav. Wait for real content.
await mcp.chrome_devtools.wait_for({ pageId,
  text: ["Loading", "Dashboard", "Error", "No data"], timeout: 15000 });

// Console errors (only error/warn)
await mcp.chrome_devtools.list_console_messages({ pageId, types: ["error", "warn"] });
// → msgid=12 [error] Uncaught TypeError: Cannot read 'map' of undefined
await mcp.chrome_devtools.get_console_message({ pageId, msgid: 12 });

// The failing API call
await mcp.chrome_devtools.list_network_requests({ pageId,
  resourceTypes: ["fetch", "xhr"] });
// → reqid=8 GET /api/items [500]
await mcp.chrome_devtools.get_network_request({ pageId, reqid: 8,
  responseFilePath: "/tmp/err.json" });
// inspect /tmp/err.json offline — keeps the body out of context
```

---

## Recipe 9 — Use a real Chrome profile (persisted logins)

> *Solves the #1 pain: re-doing auth every session.*

Instead of a fresh headless profile, point the server at a Chrome that is
already logged in:

```bash
# 1. Start Chrome with remote debugging on :9222 (close other Chrome instances first)
google-chrome --remote-debugging-port=9222 &     # or chromium / chrome.exe

# 2. Edit ~/.mcporter/mcporter.json → use --browserUrl:
#    "args": ["-y","chrome-devtools-mcp@latest","--browserUrl","http://127.0.0.1:9222"]
```

```ts
// 3. Bounce fabric's MCP runtime so it picks up the new config
await tools.call({ ref: "mcp.$reload" });

// 4. Verify
await mcp.chrome_devtools.list_pages({});   // shows your real tabs
```

On this WSL box both servers already work this way (Windows Chrome instances on
9222 / 9223 — see `../SKILL.md`).

> **Frozen-tabs caveat:** chrome-devtools-mcp *forces every tab to load*. If your
> profile has hundreds of tabs, Chrome may OOM-crash. Close what you don't need,
> or use a dedicated `--userDataDir` profile for automation.

---

## Recipe 10 — Debug "why does the layout look wrong"

> *Real use: container inspection when a widget renders at the wrong height.*

Combine `getBoundingClientRect` + `getComputedStyle` + child structure:
```ts
await mcp.chrome_devtools.evaluate_script({ pageId, function: `() => {
  const c = document.querySelector(".container");
  if (!c) return "not found";
  const r = c.getBoundingClientRect();
  const cs = getComputedStyle(c);
  return {
    height: r.height,
    minHeight: cs.minHeight,
    children: c.children.length,
    firstChild: c.children[0]?.tagName + (c.children[0]?.className ? "." + c.children[0].className : ""),
    lastChild:  c.children[c.children.length-1]?.tagName
  };
}` });
```
For full pairwise layout verification (alignment, gaps, overlaps), pair this
with the **`layout-check`** skill instead of eyeballing screenshots.

---

## Recipe 11 — Performance trace

```ts
// 1. Land on the page first (trace reloads by default)
await mcp.chrome_devtools.navigate_page({ pageId, type: "url", url: "https://example.com" });

// 2. Record (auto-reloads + auto-stops after load)
await mcp.chrome_devtools.performance_start_trace({ pageId });
// For interactive tracing (clicks, animations):
await mcp.chrome_devtools.performance_start_trace({ pageId, reload: false, autoStop: false });
// … <interact> …
await mcp.chrome_devtools.performance_stop_trace({ pageId, filePath: "/tmp/trace.json.gz" });

// 3. Drill into an insight set (id from stop_trace output)
await mcp.chrome_devtools.performance_analyze_insight({ pageId,
  insightSetId: "set_1", insightName: "LCPBreakdown" });
```
> **Lighthouse ≠ performance.** `lighthouse_audit` excludes perf. For Core Web
> Vitals always use the trace tools.

---

## When to stop reaching for Chrome

- **Static HTML / source** → `pi.read` the file. No browser needed.
- **Computed CSS / box model** → the `chrome-css` skill wraps the right calls.
- **Alignment verification** → `layout-check` skill (coordinates, not pixels).
- **Simple page→text** → try a reader tool (`zai-reader`) first; fall back to
  Chrome only if the page needs JS to render.

---

## Real errors → fixes (from session logs)

| Error | Meaning | Fix |
|---|---|---|
| `chrome-devtools appears offline` | tab crashed / runtime lost Chrome | retry `list_pages`; persistent → `tools.call({ ref: "mcp.$reload" })` |
| `MCP error -32000: Connection closed` | Chrome process died | restart the Chrome instance; `$reload` |
| `MCP error -32001: Request timed out` | cold start or slow page | wait ~8s, retry once |
| `Navigation timeout of 10000 ms exceeded` | site too slow | retry `navigate_page` (often lands 2nd try); or raise `timeout` |
| `Element with uid … not found` | DOM changed since snapshot | `take_snapshot` again, use fresh uid |
| `must have required properties pageId` | schema drift — you skipped `pageId` | get it from `list_pages`; check `tools.describe` first |

Cold starts and stale uids cover the vast majority of real-world failures —
Chrome is the flaky part, not the MCP.
