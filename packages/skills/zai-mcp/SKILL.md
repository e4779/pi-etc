---
name: zai-mcp
description: >
  Web search, page-to-markdown, and image/video analysis via four Z.AI MCP
  servers (search / reader / zread / vision), called through the mcporter CLI.
  Use whenever the task needs ANY external or time-sensitive information:
  current docs or API references, library versions and release notes, recent
  events, error messages from the wild, package/framework comparisons — do not
  answer these from training data and do not raw-fetch pages when the reader
  exists. Also: fetch a page as markdown, research a topic, read a GitHub repo
  semantically, OCR a screenshot, analyze an image or video, compare UI
  screenshots. Load this skill BEFORE the first zai call — arg names are not
  guessable (web_search_prime takes `search_query`; `query`/`num` fail
  typecheck) and search results arrive double-encoded. RU: поищи в интернете,
  погугли, найди актуальную информацию, проверь версию/релиз/документацию,
  разбери ошибку, открой страницу как markdown, проанализуй скриншот или видео.
---

# Z.AI MCP (zai-search / zai-reader / zai-zread / zai-vision)

Four MCP servers, called through the **mcporter CLI** (the door on vanilla
contours). Search + reader cover the bulk of real use (46% + 41% across
~2600 recorded calls on the fabric contour); `zai-zread` and `zai-vision`
load on demand from `references/`.

## Prerequisites

- Servers present in `~/.mcporter/mcporter.json`: `zai-search`, `zai-reader`,
  `zai-zread` (HTTP, stateless) and `zai-vision` (STDIO, needs `Z_AI_API_KEY`
  in the server `env`). Check live: `mcporter list`.
- **No daemon, no Chrome** — stateless servers; the first call connects.

## How to call

```sh
# search — arg names are part of the contract:
mcporter call zai-search web_search_prime \
  --args '{"search_query":"GLM-4.6 release notes","content_size":"high"}' \
  > /tmp/zai-search.json

# reader — page to markdown:
mcporter call zai-reader webReader \
  --args '{"url":"https://example.com/post"}' > /tmp/zai-page.json
```

Park on disk, slice on demand — the shell IS the context discipline:

```sh
jq -RR 'fromjson | fromjson' /tmp/zai-search.json |
  jq -r '.[] | "• \(.title)\n  \(.link | .[:100])\n  \(.content[:180])"' | head
```

Batch independent calls as a shell fan-out (one round trip of attention):

```sh
( mcporter call zai-reader webReader --args '{"url":"https://first.example"}' > /tmp/a.json ) &
( mcporter call zai-reader webReader --args '{"url":"https://second.example"}' > /tmp/b.json ) &
wait
```

⚠️ **Double-encoding quirk** (server-side, hits every transport; seen
2026-09-08): the search envelope arrives as a JSON string wrapping a JSON
array — decode twice (`fromjson | fromjson` in jq, recursive JSON.parse in
ts). A silent `[]` or a string where you expect an array is almost always
this, not a broken search — the call itself answers in ~2s.

Computed refs and raw hyphenated server names:

```sh
mcporter call zai-zread get_repo_structure --args '{"repo_name":"9fans/go"}'
mcporter call zai-zread read_file --args '{"repo_name":"9fans/go","file_path":"README.md"}'
```

## On a fabric contour (secondary door)

Fabric surfaces the same servers as natives (`mcp.<server>.<tool>()`,
hyphens → underscores, inside `fabric_exec`); prefer natives there — no
process spawn, no quoting, results are values:

```ts
const hits = await mcp.zai_search.web_search_prime({ search_query: "…" });
let v: any = hits.text;
while (typeof v === 'string') { try { v = JSON.parse(v); } catch { break; } }
```

## When to use

- "Search the web for …", "find sources on …", "what's new on …" → `zai-search`
- "Fetch / read this URL", "turn this page into markdown" → `zai-reader`
- Research loop: search → read → synthesize (the bread-and-butter workflow)

## Top tools

### `zai-search.web_search_prime` — web search (41% of calls)
Returns `[{title, link, content, refer}, ...]`. Optional: `content_size`
(low|medium|high), `search_recency_filter` (day|week|month|year),
`search_domain_filter` (e.g. `site:github.com`), `location`.

### `zai-reader.webReader` — page → markdown (46%, the single most-used tool)
Optional: `return_format` (markdown|html|text), `retain_images`, `no_gfm`,
`keep_img_data_url`, `with_images_summary`, `with_links_summary`, `no_cache`,
`timeout`.

### The research loop (search → read → park → synthesize)
```sh
mcporter call zai-search web_search_prime \
  --args '{"search_query":"…","content_size":"high"}' > /tmp/hits.json
jq -RR 'fromjson | fromjson' /tmp/hits.json | jq -r '.[].link' | head -2 > /tmp/links
( mcporter call zai-reader webReader --args "{\"url\":\"$(sed -n 1p /tmp/links)\"}" > /tmp/source-1.md.json ) &
( mcporter call zai-reader webReader --args "{\"url\":\"$(sed -n 2p /tmp/links)\"}" > /tmp/source-2.md.json ) &
wait
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

### Reference loading (on demand)

- **Full tool inventory** (zread/vision tools, every optional param) → read
  `references/tools.md` in this skill's directory
- **Worked scenarios** (GitHub repo dive, OCR an error screenshot, chart
  analysis, UI diff, long-video summary, screenshot → HTML/CSS) → read
  `references/recipes.md`

Load these only when the task needs them — that's the whole point.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Unknown MCP server 'X'` | not in `~/.mcporter/mcporter.json` — add it; `mcporter list` to verify |
| `401` / auth error | `Z_AI_API_KEY` (vision env) or `Authorization` header (http servers) wrong in mcporter.json |
| `429` / quota | rate/quota limit — wait and retry, or lower `content_size` |
| search returns `[]` / string | not broken: double-encoded JSON — parse twice (see quirk above) |
| `Tool X not found` | name is exact — see the anti-pattern table; `mcporter list` shows the server, references/tools.md the tools |
| `repo not found` on zread | `repo_name` is not a github.com `owner/repo` — other forges are not indexed |
| Empty / truncated reader output | retry with `no_cache: true`, or raise `timeout`; some sites block bots |
| `vision` tool times out / errors | STDIO cold start — retry once; large videos need a URL, not a local path |
