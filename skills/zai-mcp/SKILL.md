---
name: zai-mcp
description: >
  Web search, page-to-markdown, GitHub repo knowledge, and image/video
  analysis via four Z.AI MCP servers. Use when the user asks to search the
  web, fetch a page as markdown, research a topic, read a GitHub repo
  semantically, OCR a screenshot, analyze an image or video, or compare UI
  screenshots. Wraps `mcporter call zai-{search,reader,zread,vision}.*` so
  the MCP schemas (~8k tokens) stay out of context until needed.
allowed-tools: bash read
---

# Z.AI MCP (zai-search / zai-reader / zai-zread / zai-vision)

Four MCP servers behind `mcporter call`. The top two tools (search + reader)
cover **87% of real use** (46% + 41% across ~2600 recorded calls); `zai-zread`
and `zai-vision` load on demand from `references/`.

## Prerequisites

- **`mcporter` CLI** on PATH; four servers configured in `~/.mcporter/mcporter.json`:
  `zai-search`, `zai-reader`, `zai-zread` (HTTP, stateless) and `zai-vision`
  (STDIO, stateless — needs `Z_AI_API_KEY` in the server `env`).
- **No daemon, no Chrome** — unlike `chrome-devtools`, these are stateless
  HTTP/STDIO servers that connect on-demand per call. Nothing to start/restart.

Verify they're reachable:
```bash
mcporter list zai-search  --brief   # → web_search_prime
mcporter list zai-reader  --brief   # → webReader
mcporter list zai-zread   --brief   # → search_doc, get_repo_structure, read_file
mcporter list zai-vision  --brief   # → 8 tools (analyze_image, ...)
```

## When to use

- "Search the web for …", "find sources on …", "what's new on …" → `zai-search`
- "Fetch / read this URL", "turn this page into markdown" → `zai-reader`
- Research loop: search → read → synthesize (the bread-and-butter workflow)
- "Read this GitHub repo" semantically without cloning → `zai-zread`
- OCR a screenshot, read a chart/diagram, analyze an image or video, diff two UI
  screenshots → `zai-vision`

**Don't** use it for local files — `read` them. Don't use it for live JS pages
needing clicks/login — that's `chrome-devtools`.

## Top tools (87% of real use)

All calls: `mcporter call zai-<server>.<tool> key=value ...`.

### `zai-search.web_search_prime` — web search (41%)
```bash
mcporter call zai-search.web_search_prime search_query="GLM-4.6 release notes"
mcporter call zai-search.web_search_prime \
  search_query="rust async runtime site:github.com" \
  content_size=high search_recency_filter=month
```
Returns JSON `[{title, link, content, refer}, ...]`. Optional: `content_size`
(low|medium|high), `search_recency_filter` (day|week|month|year),
`search_domain_filter` (e.g. `site:github.com`), `location`.

### `zai-reader.webReader` — page → markdown (46%, the single most-used tool)
```bash
mcporter call zai-reader.webReader url=https://example.com/post
mcporter call zai-reader.webReader url=https://example.com/post \
  return_format=markdown with_links_summary=true
```
Optional: `return_format` (markdown|html|text), `retain_images`, `no_gfm`,
`keep_img_data_url`, `with_images_summary`, `with_links_summary`, `no_cache`,
`timeout`.

### The research loop (search → read → save → synthesize)
```bash
# 1. find sources
mcporter call zai-search.web_search_prime search_query="..." content_size=high \
  > /tmp/zai-search.json
# 2. read each promising URL → markdown, written to disk
mcporter call zai-reader.webReader url=https://first-hit.example.com  > /tmp/source-1.md
mcporter call zai-reader.webReader url=https://second-hit.example.com > /tmp/source-2.md
# 3. read the saved files, synthesize, write the page
```
Saving to `/tmp/*.md` keeps the raw bytes out of context — you `read` what you
need, when you need it. This is the pattern behind the heaviest real sessions
(research-llm-wiki: 114 reader calls; invest-research: finam/MOEX/dohod).

## ⚠️ Tool names are EXACT — the #1 agent error

Agents routinely invent plausible names that **do not exist** — this accounted
for 19 logged failures. When unsure, check: `mcporter list <server> --brief`.

| ❌ Doesn't exist | ✅ Correct |
|---|---|
| `zai-search.search` | `zai-search.web_search_prime` |
| `zai-search.zai_search` | `zai-search.web_search_prime` |
| `zai-search.web_reader_prime` | `zai-search.web_search_prime` |
| `zai-reader.read_url` | `zai-reader.webReader` |
| `zai-reader.zai_read` | `zai-reader.webReader` |
| `zai-reader.get_markdown` | `zai-reader.webReader` |

The trap is the inconsistency: search is `web_search_prime` (snake_case) but
reader is `webReader` (camelCase). Memorize both, or always check first.

## When you need more

- **All 13 tools + full signatures** (3 `zai-zread` repo tools, 8 `zai-vision`
  image/video tools, every optional param) → `read skills/zai-mcp/references/tools.md`
- **Worked scenarios** (GitHub repo dive, OCR an error screenshot, chart
  analysis, UI diff, long-video summary, screenshot → HTML/CSS) → `read skills/zai-mcp/references/recipes.md`

Load these only when the task needs them — that's the whole point.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `401` / auth error | `Z_AI_API_KEY` missing or wrong in the server's `env` block of `~/.mcporter/mcporter.json` |
| `429` / quota | rate/quota limit — wait and retry, or lower `content_size` |
| `Tool X not found` / "not a known tool" | name is wrong → `mcporter list <server> --brief` for the exact name (see the anti-pattern table above) |
| Empty / truncated reader output | retry with `no_cache=true`, or raise `timeout=`; some sites block bots |
| `vision` tool times out / errors | STDIO cold start — retry once; large videos need a URL, not a local path |

No daemon to restart — unlike `chrome-devtools`, there's nothing to reboot.
