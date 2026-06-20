# Z.AI MCP — Full Tool Reference

> **Read on demand.** Every tool across the four servers, with full signatures.
> The common 87% (search + reader) lives in `../SKILL.md`; load this when a task
> needs `zai-zread` or `zai-vision`, or the exact optional params for search/reader.

## Tool surface

| server | transport | tools | use |
|---|---|---|---|
| `zai-search` | HTTP | 1 | web search |
| `zai-reader` | HTTP | 1 | page → markdown/html/text |
| `zai-zread` | HTTP | 3 | semantic read of a GitHub repo |
| `zai-vision` | STDIO | 8 | image/video analysis (GLM-4.6V) |
| | | **13** | |

**Confirm what's live on your box:**
```bash
mcporter list zai-search --brief
mcporter list zai-vision --schema   # full params
```
If a tool is missing, the server isn't configured in `~/.mcporter/mcporter.json`.

All calls: `mcporter call zai-<server>.<tool> key=value ...`

---

## zai-search — web search (1 tool)

### `web_search_prime` — web search
```bash
mcporter call zai-search.web_search_prime search_query="GLM-4.6 benchmarks"
mcporter call zai-search.web_search_prime \
  search_query="tokio runtime internals site:github.com" \
  content_size=high search_recency_filter=month
```
Returns JSON array `[{title, link, content, refer}, ...]`.

| param | type | req | notes |
|---|---|---|---|
| `search_query` | string | ✓ | the query |
| `content_size` | string | | `low` \| `medium` \| `high` (detail/volume of results) |
| `search_recency_filter` | string | | `day` \| `week` \| `month` \| `year` |
| `search_domain_filter` | string | | e.g. `site:github.com` |
| `location` | string | | geo |

---

## zai-reader — page → markdown (1 tool)

### `webReader` — fetch a URL as markdown/html/text
```bash
mcporter call zai-reader.webReader url=https://example.com/post
mcporter call zai-reader.webReader url=https://example.com/post \
  return_format=markdown with_links_summary=true retain_images=true
```

| param | type | req | notes |
|---|---|---|---|
| `url` | string | ✓ | page to fetch |
| `return_format` | string | | `markdown` (default) \| `html` \| `text` |
| `retain_images` | bool | | keep images in output |
| `no_gfm` | bool | | disable GitHub-flavored markdown |
| `keep_img_data_url` | bool | | keep full image data URLs |
| `with_images_summary` | bool | | append an image inventory |
| `with_links_summary` | bool | | append a link inventory |
| `no_cache` | bool | | bypass cache (fresh fetch) |
| `timeout` | number | | seconds |

Returns: title, description, url, content (markdown/html/text), metadata
(Open Graph, Twitter card, viewport, theme-color, …), external assets.

---

## zai-zread — semantic GitHub-repo read (3 tools)

Read a repo **without cloning**. The server indexes `owner/repo` on demand and
answers structurally. Best for large repos or quick "how does X work" questions.
`repo_name` is always `owner/repo` (e.g. `9fans/go`, `tokio-rs/tokio`).

### `get_repo_structure` — list a directory
```bash
mcporter call zai-zread.get_repo_structure repo_name=9fans/go
mcporter call zai-zread.get_repo_structure repo_name=9fans/go dir_path=9p
```
| param | type | req | notes |
|---|---|---|---|
| `repo_name` | string | ✓ | `owner/repo` |
| `dir_path` | string | | sub-directory (omit = root) |

### `search_doc` — semantic search of the repo's docs/code
```bash
mcporter call zai-zread.search_doc repo_name=9fans/go query="9p attach handshake"
mcporter call zai-zread.search_doc repo_name=9fans/go query="..." language=go
```
| param | type | req | notes |
|---|---|---|---|
| `repo_name` | string | ✓ | `owner/repo` |
| `query` | string | ✓ | natural-language query |
| `language` | string | | hint the result language |

### `read_file` — fetch one file's content
```bash
mcporter call zai-zread.read_file repo_name=9fans/go file_path=README.md
```
| param | type | req | notes |
|---|---|---|---|
| `repo_name` | string | ✓ | `owner/repo` |
| `file_path` | string | ✓ | path inside the repo |

Typical dive: `get_repo_structure` (orient) → `search_doc` (find) → `read_file`
(confirm). See `recipes.md`.

---

## zai-vision — image/video analysis (8 tools, GLM-4.6V)

`image_source` / `video_source` is a **URL or local file path**. Every tool
takes a `prompt`; some take an extra hint param. STDIO transport — cold start
adds a second or two on the first call.

### `analyze_image` — describe / answer questions about an image
```bash
mcporter call zai-vision.analyze_image image_source=/tmp/diagram.png \
  prompt="What does this architecture show? List each component."
```
| param | type | req | notes |
|---|---|---|---|
| `image_source` | string | ✓ | URL or path |
| `prompt` | string | ✓ | question / instruction |

### `analyze_video` — analyze / summarize a video
```bash
mcporter call zai-vision.analyze_video video_source=/tmp/demo.mp4 \
  prompt="Summarize the workflow shown, step by step."
```
| param | type | req | notes |
|---|---|---|---|
| `video_source` | string | ✓ | URL or path (long videos → prefer URL) |
| `prompt` | string | ✓ | question / instruction |

### `extract_text_from_screenshot` — OCR (with optional language hint)
```bash
mcporter call zai-vision.extract_text_from_screenshot image_source=/tmp/err.png \
  prompt="Transcribe every visible character, preserving layout."
mcporter call zai-vision.extract_text_from_screenshot image_source=/tmp/snippet.png \
  prompt="Transcribe the code." programming_language=python
```
| param | type | req | notes |
|---|---|---|---|
| `image_source` | string | ✓ | URL or path |
| `prompt` | string | ✓ | instruction |
| `programming_language` | string | | hint, improves code OCR |

### `understand_technical_diagram` — architecture / flow / schema diagrams
```bash
mcporter call zai-vision.understand_technical_diagram image_source=/tmp/arch.png \
  prompt="Explain data flow end to end." diagram_type=architecture
```
| param | type | req | notes |
|---|---|---|---|
| `image_source` | string | ✓ | URL or path |
| `prompt` | string | ✓ | instruction |
| `diagram_type` | string | | e.g. `architecture`, `flowchart`, `schema` |

### `analyze_data_visualization` — charts / plots / dashboards
```bash
mcporter call zai-vision.analyze_data_visualization image_source=/tmp/chart.png \
  prompt="What is the trend? Read off the key values." analysis_focus=trend
```
| param | type | req | notes |
|---|---|---|---|
| `image_source` | string | ✓ | URL or path |
| `prompt` | string | ✓ | instruction |
| `analysis_focus` | string | | e.g. `trend`, `outliers`, `values` |

### `diagnose_error_screenshot` — read an error screen with context
```bash
mcporter call zai-vision.diagnose_error_screenshot image_source=/tmp/panic.png \
  prompt="What crashed and why?" context="rust build, nightly"
```
| param | type | req | notes |
|---|---|---|---|
| `image_source` | string | ✓ | URL or path |
| `prompt` | string | ✓ | instruction |
| `context` | string | | what you were doing when it happened |

### `ui_to_artifact` — screenshot → code / spec / description
```bash
mcporter call zai-vision.ui_to_artifact image_source=/tmp/ui.png \
  output_type=code prompt="Produce a self-contained HTML+CSS recreation."
mcporter call zai-vision.ui_to_artifact image_source=/tmp/ui.png \
  output_type=spec prompt="Write a component spec a dev can implement from."
```
| param | type | req | notes |
|---|---|---|---|
| `image_source` | string | ✓ | URL or path |
| `output_type` | string | ✓ | `code` \| `prompt` \| `spec` \| `description` |
| `prompt` | string | ✓ | shaping instruction |

### `ui_diff_check` — compare two screenshots
```bash
mcporter call zai-vision.ui_diff_check \
  expected_image_source=/tmp/expected.png \
  actual_image_source=/tmp/actual.png \
  prompt="List every visual difference."
```
| param | type | req | notes |
|---|---|---|---|
| `expected_image_source` | string | ✓ | URL or path |
| `actual_image_source` | string | ✓ | URL or path |
| `prompt` | string | ✓ | what to focus on |

---

## See also

- `../SKILL.md` — the 87% (search + reader) and the research-loop workflow
- `recipes.md` — worked end-to-end scenarios for zread and vision
