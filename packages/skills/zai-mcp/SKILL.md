---
name: zai-mcp
description: >
  Web search, page-to-markdown, and image/video analysis via four Z.AI MCP
  servers (search / reader / zread / vision). Use whenever the task needs ANY
  external or time-sensitive information: current docs or API references,
  library versions and release notes, recent events, error messages from the
  wild, package/framework comparisons — do not answer these from training data
  and do not raw-fetch pages when the reader exists. Also: fetch a page as
  markdown, research a topic, read a GitHub repo semantically, OCR a
  screenshot, analyze an image or video, compare UI screenshots. Load this
  skill BEFORE the first mcp.zai_* call — arg names are not guessable
  (web_search_prime takes `search_query`; `query`/`num` fail typecheck) and
  search results arrive double-encoded. RU: поищи в интернете, погугли, найди
  актуальную информацию, проверь версию/релиз/документацию, разбери ошибку,
  открой страницу как markdown, проанализируй скриншот или видео.
---

# Z.AI MCP (zai-search / zai-reader / zai-zread / zai-vision)

Four MCP servers as **fabric natives**. Fabric discovers them from
`~/.mcporter/mcporter.json` (its MCP runtime is mcporter-based) and exposes
every tool as `mcp.<server>.<tool>()` inside `fabric_exec` — hyphens in
server names become underscores. The top two tools (search + reader) cover
**87% of real use** (46% + 41% across ~2600 recorded calls); `zai-zread` and
`zai-vision` load on demand from `references/`.

## Prerequisites

- Servers present in `~/.mcporter/mcporter.json`: `zai-search`, `zai-reader`,
  `zai-zread` (HTTP, stateless) and `zai-vision` (STDIO, needs `Z_AI_API_KEY`
  in the server `env`).
- **No daemon, no Chrome** — stateless servers; the first native call connects.

Check what's registered (any `fabric_exec`):

```ts
const servers = await tools.call({ ref: "mcp.$servers" });   // server list + tool counts
const zaiTools = await tools.list({ provider: "mcp" });       // full action catalog
```

`stale: true, tools: 0` just means "not connected yet" — the first call wakes
the server up.

## How to call

```ts
// inside fabric_exec
const hits = await mcp.zai_search.web_search_prime({
  search_query: "GLM-4.6 release notes",
  content_size: "high",                 // optional
});

const page = await mcp.zai_reader.webReader({ url: "https://example.com/post" });

// batch independent calls — one round trip of your attention
const [a, b] = await Promise.all([
  mcp.zai_reader.webReader({ url: "https://first-hit.example.com" }),
  mcp.zai_reader.webReader({ url: "https://second-hit.example.com" }),
]);

// big results: park on disk, read slices on demand
await pi.write({ path: "/tmp/source-1.md",
  text: String(page.text ?? page.structuredContent ?? page) });
```

Results are commonly `{ text, content, structuredContent }` — prefer
`.structuredContent` when present, else `.text`.

⚠️ `zai_search` envelope quirk (seen 2026-09-08): `structuredContent` arrives
`null` and `text` is a **double-encoded JSON string** (JSON string wrapping a
JSON array). Decode recursively until you hold a real array:

```ts
let v: any = r.text;
while (typeof v === 'string') { try { v = JSON.parse(v); } catch { break; } }
// v → [{title, link, content, refer}, ...]
```

A silent `[]` (or a string where you expect an array) is almost always this,
not a broken search — the call itself answers in ~2s.

Computed/dynamic refs and raw server names go through the generic path:

```ts
await tools.call({ ref: "mcp.zai-zread.get_repo_structure",
  args: { repo_name: "9fans/go" } });   // ref keeps the raw hyphenated name
await tools.call({ ref: "mcp.$call",
  args: { server: "zai-zread", tool: "read_file",
          args: { repo_name: "9fans/go", file_path: "README.md" } } });
```

`mcporter call …` in a shell still works as a break-glass fallback, but under
fabric prefer natives: no process spawn, no quoting, results are values.

## When to use

- "Search the web for …", "find sources on …", "what's new on …" → `zai-search`
- "Fetch / read this URL", "turn this page into markdown" → `zai-reader`
- Research loop: search → read → synthesize (the bread-and-butter workflow)
- "Read this GitHub repo" semantically without cloning → `zai-zread`
  (`repo_name` must be a **github.com** `owner/repo` — other forges 404)
- OCR a screenshot, read a chart/diagram, analyze an image or video, diff two UI
  screenshots → `zai-vision`
- **Verify a rendered HTML/chart looks right** → the chrome-devtools → zai-vision
  loop (Recipe 8): screenshot the live page, ask vision to check it. Catches
  bugs code review misses.

**Don't** use it for local files — `pi.read` them. Don't use it for live JS pages
needing clicks/login — that's `chrome-devtools`.

## Top tools (87% of real use)

### `zai_search.web_search_prime` — web search (41%)
Returns `[{title, link, content, refer}, ...]`. Optional: `content_size`
(low|medium|high), `search_recency_filter` (day|week|month|year),
`search_domain_filter` (e.g. `site:github.com`), `location`.

### `zai_reader.webReader` — page → markdown (46%, the single most-used tool)
Optional: `return_format` (markdown|html|text), `retain_images`, `no_gfm`,
`keep_img_data_url`, `with_images_summary`, `with_links_summary`, `no_cache`,
`timeout`.

### The research loop (search → read → park → synthesize)
```ts
const hits = await mcp.zai_search.web_search_prime({
  search_query: "...", content_size: "high" });
const [s1, s2] = await Promise.all([
  mcp.zai_reader.webReader({ url: hits[0].link }),
  mcp.zai_reader.webReader({ url: hits[1].link }),
]);
await pi.write({ path: "/tmp/source-1.md", text: String(s1.text ?? s1) });
await pi.write({ path: "/tmp/source-2.md", text: String(s2.text ?? s2) });
// then pi.read the files when you actually need their bytes
```
Parking on disk keeps the raw bytes out of context — the pattern behind the
heaviest real sessions (research-llm-wiki: 114 reader calls; invest-research:
finam/MOEX/dohod).

## ⚠️ Tool names are EXACT — the #1 agent error

Agents routinely invent plausible names that **do not exist** — this accounted
for 19 logged failures. When unsure, check `tools.list({ provider: "mcp" })`.

| ❌ Doesn't exist | ✅ Correct |
|---|---|
| `zai_search.search` | `zai_search.web_search_prime` |
| `zai_search.zai_search` | `zai_search.web_search_prime` |
| `zai_search.web_reader_prime` | `zai_search.web_search_prime` |
| `zai_reader.read_url` | `zai_reader.webReader` |
| `zai_reader.zai_read` | `zai_reader.webReader` |
| `zai_reader.get_markdown` | `zai_reader.webReader` |

The trap is the inconsistency: search is `web_search_prime` (snake_case) but
reader is `webReader` (camelCase). Memorize both, or always check first.

## When you need more

- **All 13 tools + full signatures** (3 `zai-zread` repo tools, 8 `zai-vision`
  image/video tools, every optional param) → `pi.read` `skills/zai-mcp/references/tools.md`
- **Worked scenarios** (GitHub repo dive, OCR an error screenshot, chart
  analysis, UI diff, long-video summary, screenshot → HTML/CSS) → `pi.read` `skills/zai-mcp/references/recipes.md`

Load these only when the task needs them — that's the whole point.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Unknown MCP server 'X'` | server not in `~/.mcporter/mcporter.json` — add it, then `tools.call({ref:"mcp.$reload"})`; one-off servers can be `mcp.$register`-ed ephemeral |
| `stale: true` in `$servers` | lazy connection — just call a tool; it wakes up |
| `401` / auth error | `Z_AI_API_KEY` (vision env) or `Authorization` header (http servers) wrong in `~/.mcporter/mcporter.json` |
| `429` / quota | rate/quota limit — wait and retry, or lower `content_size` |
| search returns `[]` / string | not broken: `text` is double-encoded JSON — parse it twice (see quirk above) |
| `Tool X not found` | name is wrong → `tools.list({provider:"mcp"})` (see the anti-pattern table above) |
| `repo not found` on zread | `repo_name` is not a github.com `owner/repo` — other forges are not indexed |
| Empty / truncated reader output | retry with `no_cache: true`, or raise `timeout`; some sites block bots |
| `vision` tool times out / errors | STDIO cold start — retry once; large videos need a URL, not a local path |
