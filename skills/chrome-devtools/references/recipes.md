# Chrome DevTools — Recipes

> **Read on demand.** Worked scenarios built from `mcporter call`.
> Tools are documented in `tools.md`; the core workflow is in `../SKILL.md`.

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

- Every interaction starts from a fresh `take_snapshot` — **uids change when the
  DOM changes**. Don't reuse a uid across navigation or dynamic updates.
- Arrays need JSON or function-call syntax (bare `key=a,b` is rejected):
  ```bash
  mcporter call chrome-devtools.list_console_messages --args '{"types":["error","warn"]}'
  mcporter call 'chrome-devtools.list_console_messages(types: ["error","warn"])'
  ```
- `includeSnapshot=true` on click/fill/hover returns a fresh snapshot in the
  same response — saves a round-trip.
- Confirm the daemon is up first: `mcporter daemon status`.

---

## Recipe 1 — Scrape a data table out of a page

> *Pattern observed 5+ times parsing БПИФ / MOEX report tables.*

Most real pages don't give you clean JSON — the data is in a `<table>` you have
to walk. Three variants, cheapest first.

### Variant A — count + sanity-check before extracting
Don't dump a huge table blind. Probe structure first:
```bash
mcporter call chrome-devtools.evaluate_script function='() => {
  const tables = [...document.querySelectorAll("table")];
  return {
    tableCount: tables.length,
    rowsPerTable: tables.map(t => t.rows.length),
    h2: [...document.querySelectorAll("h2")].map(h => h.textContent.trim())
  };
}'
```
Tells you which table index holds your data (e.g. "the report table is `tables[1]`").

### Variant B — extract one table as a matrix
```bash
mcporter call chrome-devtools.evaluate_script function='() => {
  const tables = [...document.querySelectorAll("table")];
  const report = tables[1];                         // index from Variant A
  if (!report) return { error: "no report table", tableCount: tables.length };
  const rows = [...report.querySelectorAll("tr")].slice(1).map(tr =>
    [...tr.querySelectorAll("td")].map(td => td.textContent.trim())
  );
  return { rows, rowCount: rows.length };
}'
```
Returns `rows` as an array-of-arrays — ready to format as CSV/TOON.

### Variant C — table summary (when you only need shape + edges)
```bash
mcporter call chrome-devtools.evaluate_script function='() => {
  const t = document.querySelector(".tilt-table");
  if (!t) return "no tilt-table";
  return {
    rows: t.rows.length,
    cols: t.rows[0]?.cells.length ?? 0,
    firstRow: [...t.rows[0].cells].map(c => c.textContent.trim()),
    lastRow:  [...t.rows.at(-1).cells].map(c => c.textContent.trim())
  };
}'
```
Cheaper than Variant B — read first/last row to confirm it's the right table,
then decide if you need the full dump.

---

## Recipe 2 — Extract a section between two headings

> *Real use: pull "Шаг 2: …" block out of a long regulatory document.*

When content lives between `<h2>`s, walk `nextElementSibling` until you hit the
next heading:
```bash
mcporter call chrome-devtools.evaluate_script function='() => {
  let el = document.querySelector("h2");
  while (el && !el.textContent.includes("Шаг 2")) el = el.nextElementSibling;
  if (!el) return "not found";
  const section = el.parentElement;
  const rows = [...section.querySelectorAll(".tilt-table tbody tr, table tr")]
    .map(r => [...r.querySelectorAll("td,th")].map(c => c.textContent.trim()).join(" | "))
    .filter(Boolean);
  return rows.join("\n");
}'
```

---

## Recipe 3 — Trigger lazy-loaded content (scroll, click "load more")

> *Real use: infinite-scroll lists on dohod.ru / MOEX history.*

Many pages load rows as you scroll. Scroll, wait, re-measure:
```bash
# 1. Scroll to the bottom
mcporter call chrome-devtools.evaluate_script function='() => {
  window.scrollTo(0, document.body.scrollHeight);
  return "scrolled to " + document.body.scrollHeight;
}'

# 2. Wait for the fetch to land
sleep 1

# 3. Re-count; repeat until the count stops growing
mcporter call chrome-devtools.evaluate_script function='() => document.querySelectorAll(".item").length'
```
For a "load more" button variant, see Recipe 5 (batch clicks in one evaluate).

---

## Recipe 4 — Investigate before interacting

> *The single most-repeated pattern. Always inspect page state first.*

Before filling a form, clicking, or scraping, probe the page cheaply:
```bash
mcporter call chrome-devtools.evaluate_script function='() => ({
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
})'
```
`compatMode: "BackCompat"` in particular explains a *lot* of "why does the
layout look wrong" bugs (page is in quirks mode).

---

## Recipe 5 — Read page text without dumping the whole DOM

> *Real use: quick "what's actually visible" check.*

`document.body.innerText` gives rendered text (no HTML noise). Always **slice**
it — full innerText of a long page blows up context:
```bash
# First 3000 chars — enough to identify the page
mcporter call chrome-devtools.evaluate_script function='() => document.body.innerText.slice(0, 3000)'

# Too big? save to a file and read with the `read` tool only if needed
mcporter call chrome-devtools.evaluate_script \
  function='() => document.body.innerText' filePath=/tmp/page.txt
```

---

## Recipe 6 — Find downloadable files (PDFs, videos, data)

> *Real use: locating PDF reports and video sources on a page.*

### PDF / link harvest
```bash
mcporter call chrome-devtools.evaluate_script function='() => {
  const links = document.querySelectorAll("a");
  return [...links].filter(a => a.href.includes(".pdf")).map(a => a.href).slice(0, 10);
}'
```

### Video / media (with fallback)
```bash
mcporter call chrome-devtools.evaluate_script function='() => {
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
}'
```

---

## Recipe 7 — Login flow with validation

```bash
# 1. Navigate to the login page
mcporter call chrome-devtools.navigate_page type=url url=https://app.example.com/login

# 2. Snapshot to find the form fields
mcporter call chrome-devtools.take_snapshot
# → note uids: 1_3 = username, 1_4 = password, 1_5 = submit

# 3. Fill the whole form in ONE call (faster than two `fill`s)
mcporter call chrome-devtools.fill_form --args '{
  "elements": [
    {"uid":"1_3","value":"alice@example.com"},
    {"uid":"1_4","value":"correct horse battery staple"}
  ]
}'

# 4. Click submit (return fresh snapshot in the same call)
mcporter call chrome-devtools.click uid=1_5 includeSnapshot=true

# 5. Wait for a success/failure indicator
mcporter call chrome-devtools.wait_for --args '{"text":["Dashboard","Welcome","Invalid","Log in"]}'
```
**If it failed:** step 5 matches `"Invalid"` / `"Log in"`. Read cookies to debug
the session:
```bash
mcporter call chrome-devtools.evaluate_script function='() => document.cookie'
```
**Skip re-login next time** — drive your real Chrome profile via `--browserUrl`
(Recipe 9) so cookies/2FA persist.

---

## Recipe 8 — Debug a SPA (console errors + failing API calls)

```bash
mcporter call chrome-devtools.navigate_page type=url url=https://app.example.com/dashboard

# SPA: snapshot is empty right after nav. Wait for real content.
mcporter call chrome-devtools.wait_for --args '{"text":["Loading","Dashboard","Error","No data"],"timeout":15000}'

# Console errors (only error/warn)
mcporter call chrome-devtools.list_console_messages --args '{"types":["error","warn"]}'
# → msgid=12 [error] Uncaught TypeError: Cannot read 'map' of undefined
mcporter call chrome-devtools.get_console_message msgid=12

# The failing API call
mcporter call chrome-devtools.list_network_requests --args '{"resourceTypes":["fetch","xhr"]}'
# → reqid=8 GET /api/items [500]
mcporter call chrome-devtools.get_network_request reqid=8 responseFilePath=/tmp/err.json
# inspect /tmp/err.json offline — keeps the body out of context
```

---

## Recipe 9 — Use your real Chrome profile (persisted logins)

> *Solves the #1 pain: re-doing auth every session.*

The default config launches a fresh headless profile. Drive your normal Chrome
(already logged in) instead:

```bash
# 1. Start Chrome with remote debugging on :9222 (close other Chrome instances first)
google-chrome --remote-debugging-port=9222 &     # or chromium / chrome.exe

# 2. Edit ~/.mcporter/mcporter.json → use --browserUrl:
#    "args": ["-y","chrome-devtools-mcp@latest","--browserUrl","http://127.0.0.1:9222"]

# 3. Bounce the daemon so it picks up the new args
mcporter daemon restart && sleep 3

# 4. Verify
mcporter call chrome-devtools.list_pages   # shows your real tabs
```

> **Frozen-tabs caveat:** chrome-devtools-mcp *forces every tab to load*. If your
> profile has hundreds of tabs, Chrome may OOM-crash. Close what you don't need,
> or use a dedicated `--userDataDir` profile for automation.

---

## Recipe 10 — Debug "why does the layout look wrong"

> *Real use: container inspection when a widget renders at the wrong height.*

Combine `getBoundingClientRect` + `getComputedStyle` + child structure:
```bash
mcporter call chrome-devtools.evaluate_script function='() => {
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
}'
```
For full pairwise layout verification (alignment, gaps, overlaps), pair this
with the **`layout-check`** skill instead of eyeballing screenshots.

---

## Recipe 11 — Performance trace

```bash
# 1. Land on the page first (trace reloads by default)
mcporter call chrome-devtools.navigate_page type=url url=https://example.com

# 2. Record (auto-reloads + auto-stops after load)
mcporter call chrome-devtools.performance_start_trace
# For interactive tracing (clicks, animations):
#   mcporter call chrome-devtools.performance_start_trace reload=false autoStop=false
#   … <interact> …
#   mcporter call chrome-devtools.performance_stop_trace filePath=/tmp/trace.json.gz

# 3. Drill into an insight set (id from stop_trace output)
mcporter call chrome-devtools.performance_analyze_insight insightSetId=set_1 insightName=LCPBreakdown
```
> **Lighthouse ≠ performance.** `lighthouse_audit` excludes perf. For Core Web
> Vitals always use the trace tools.

---

## When to stop reaching for Chrome

- **Static HTML / source** → `read` the file. No browser needed.
- **Computed CSS / box model** → the `chrome-css` skill wraps the right calls.
- **Alignment verification** → `layout-check` skill (coordinates, not pixels).
- **Simple page→text** → try a reader tool (`zai-reader`) first; fall back to
  Chrome only if the page needs JS to render.

---

## Real errors → fixes (from session logs)

| Error | Meaning | Fix |
|---|---|---|
| `chrome-devtools appears offline` | tab crashed / daemon lost Chrome | `mcporter daemon restart && sleep 3` |
| `MCP error -32000: Connection closed` | Chrome process died | same — restart daemon |
| `MCP error -32001: Request timed out` | slow page or hung tab | retry; if persistent, restart daemon |
| `Navigation timeout of 10000 ms exceeded` | site too slow | retry `navigate_page` (often lands 2nd try); or raise `timeout=` |
| `Element with uid … not found` | DOM changed since snapshot | `take_snapshot` again, use fresh uid |
| `Expected array, received string` | passed array param as `key=a,b` | use `--args '{"k":["a","b"]}'` or function-call syntax |

The "restart the daemon" fix covers the vast majority of real-world failures —
Chrome is the flaky part, not the MCP.
