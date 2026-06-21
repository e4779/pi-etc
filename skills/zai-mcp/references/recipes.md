# Z.AI MCP — Recipes

> **Read on demand.** Worked scenarios built from `mcporter call`. Tools are in
> `tools.md`; the core workflow (search → reader) is in `../SKILL.md`.

**Drawn from real sessions**: the research loop is the heaviest pattern
(~830 of ~900 recorded calls are search + reader). Vision and zread are rarer
(~6% and ~1%) but high-value when you need them.

## Conventions

- Save large outputs to `/tmp/*.md` or `/tmp/*.json` and `read` what you need —
  keeps raw bytes out of context.
- Tool names are **EXACT** (`web_search_prime` vs `webReader`). When unsure,
  `mcporter list <server> --brief`.
- `image_source` / `video_source` accepts a URL **or** a local path.

---

## Recipe 1 — Research loop (the main event)

> *Pattern behind research-llm-wiki (114 reader calls), invest-research
> (finam / MOEX / dohod), 9P_Ecosystem, etc.*

Goal: research a topic and produce a synthesis (wiki page, report, summary).

```bash
# 1. SEARCH — cast a wide net
mcporter call zai-search.web_search_prime \
  search_query="GLM-4.6V vision benchmarks 2026" \
  content_size=high > /tmp/zai-search.json

# inspect the hits (title, link, content snippet per result)
# pick 2–4 promising URLs

# 2. READ — each URL → markdown, saved to disk
for url in \
  https://example.com/article-1 \
  https://example.com/article-2 ; do
  mcporter call zai-reader.webReader url="$url" \
    with_links_summary=true > "/tmp/src-$(basename $url).md"
done

# 3. SYNTHESIZE — read the saved files, cross-reference, write
```

**Why save to disk:** a single `webReader` call can return tens of KB. Writing
it to `/tmp/` and `read`-ing (with offset/limit) keeps your context lean; you
can also `rg` the saved files for specific facts.

**When to narrow:** add `search_recency_filter=month` for news, or
`search_domain_filter=site:arxiv.org` for papers.

---

## Recipe 2 — GitHub repo dive (without cloning)

> *When the repo is huge, or you only need to understand one corner.*

`zai-zread` indexes `owner/repo` on demand and answers structurally.

```bash
# 1. orient — what's at the root?
mcporter call zai-zread.get_repo_structure repo_name=9fans/go

# 2. find — semantic search for the concept
mcporter call zai-zread.search_doc \
  repo_name=9fans/go query="9p protocol attach handshake" language=go

# 3. confirm — read the exact file
mcporter call zai-zread.read_file repo_name=9fans/go file_path=9p/9p.go
```

**When to prefer this over `git clone` + `rg`:**
- the repo is very large and you need one answer
- you want semantic ("how does auth work") not literal ("fn attach") search
- quick orientation on an unfamiliar codebase

**When to just clone:** you'll read many files, or need full local tooling
(lsp, type-check, run tests).

---

## Recipe 3 — OCR an error screenshot

> *User pastes a screenshot of a crash / log / stack trace.*

```bash
mcporter call zai-vision.extract_text_from_screenshot \
  image_source=/tmp/error.png \
  prompt="Transcribe the full stack trace verbatim, preserving indentation." \
  programming_language=rust
```

Then read the transcription into your reasoning. If it's a build/runtime error,
`diagnose_error_screenshot` adds a diagnosis on top of OCR:

```bash
mcporter call zai-vision.diagnose_error_screenshot \
  image_source=/tmp/error.png \
  prompt="What's the root cause and the fix?" \
  context="cargo build on nightly, feature gate async closure"
```

---

## Recipe 4 — Analyze a chart or technical diagram

> *Chart from a PDF / paper, or an architecture diagram you can't parse by eye.*

```bash
# data chart — read values and trend
mcporter call zai-vision.analyze_data_visualization \
  image_source=/tmp/chart.png \
  prompt="Read the y-axis values at each labeled x. State the trend." \
  analysis_focus=values

# architecture / flow / schema
mcporter call zai-vision.understand_technical_diagram \
  image_source=/tmp/arch.png \
  prompt="Trace the request path from client to database, naming each hop." \
  diagram_type=architecture
```

---

## Recipe 5 — UI diff (expected vs actual)

> *Visual regression check — compare a reference screenshot to current state.*

```bash
mcporter call zai-vision.ui_diff_check \
  expected_image_source=/tmp/expected.png \
  actual_image_source=/tmp/actual.png \
  prompt="List every visual difference: spacing, color, text, position. Ignore anti-aliasing."
```

Pairs well with the `layout-check` skill (coordinate-table layout verification)
for pixel-precise assertions.

---

## Recipe 6 — Long-video analysis

> *Demo videos, conference talks — too long to watch, need a summary.*

```bash
mcporter call zai-vision.analyze_video \
  video_source=https://example.com/demo.mp4 \
  prompt="Summarize the demo as a numbered step list. Note any UI shown and any numbers mentioned."
```

Prefer a **URL** for large videos (passing a big local file over STDIO is slow).
The first call may take a few seconds (cold start + processing).

---

## Recipe 7 — Screenshot → HTML/CSS artifact

> *Recreate a UI from a screenshot.*

```bash
# get code directly
mcporter call zai-vision.ui_to_artifact \
  image_source=/tmp/target-ui.png \
  output_type=code \
  prompt="Self-contained HTML+CSS; match the layout, spacing and colors exactly. No external assets."

# or get a spec to implement yourself
mcporter call zai-vision.ui_to_artifact \
  image_source=/tmp/target-ui.png \
  output_type=spec \
  prompt="A component spec: layout grid, typography scale, color tokens, states."
```

`output_type` options: `code` (ready-to-paste), `prompt` (a prompt for another
model), `spec` (implementation spec), `description` (prose description).

---

## Recipe 8 — Render verification loop (chrome-devtools → zai-vision)

> *You rendered an HTML page / dashboard / chart and want to verify it looks
> right — without eyeballing the pixels yourself (or when your model can't
> see images). The two skills compose: chrome-devtools captures, zai-vision
> judges.*

This catches bugs that code review misses. The code *looked* correct — but a
JS charting library defaulted to a `category` axis where a numeric/`linear` one
was needed, so the axis labels showed the array indices (`0–9`) instead of the
real data range, and an annotation plugin silently never fired. The screenshot
+ vision analysis proved it was broken.

Whatever your stack — static HTML, a dev server, a built report, a generated
PDF opened in a browser — the loop is the same: **rebuild → screenshot the
live page → ask vision to check it against a structured checklist.**

```bash
# 1. rebuild the artifact through WHATEVER pipeline it uses
#    (make, cargo, npm run build, a doc generator, a CI step…)
<your build command>

# 2. load the page in chrome, FRESH each iteration.
#    Append a cache-buster query param (?v=2, ?cb=3, ...) so chrome never
#    serves a stale render of the old template from its HTTP cache.
mcporter call chrome-devtools.navigate_page \
  url='http://localhost:8000/path/to/page.html?v=2'

# 3. scroll the target region into view, then screenshot TO A FILE.
#    (inline base64 bloats context; a file path stays cheap and reusable
#    across iterations and comparisons.)
mcporter call chrome-devtools.evaluate_script \
  --function '()=>{const el=document.querySelector("#target");el.scrollIntoView({block:"center"});return{ok:true}}'
mcporter call chrome-devtools.take_screenshot --filePath /tmp/shot.png

# 4. analyze with a STRUCTURED prompt — numbered yes/no beats vague prose.
#    Pick the prompt to match what you changed; pick the tool to match what
#    the artifact IS (see the table below).
mcporter call zai-vision.analyze_data_visualization \
  image_source=/tmp/shot.png \
  prompt="Answer each yes/no: 1) <expected visual fact>? 2) <label/axis/legend present and correct>? 3) <colors as intended>? 4) Anything clipped, overlapping, or missing? Final verdict: OK or list the concrete problems."
```

Tool choice by what you're verifying:

| Artifact | vision tool |
|---|---|
| Chart / plot / data table | `analyze_data_visualization` |
| General layout, spacing, typography | `analyze_image` |
| Regression vs a known-good reference | `ui_diff_check` (pass both images) |
| Text content / labels / numbers | `extract_text_from_screenshot` |

**The prompt is the lever.** A vague prompt ("does this look ok?") gets a vague
yes. A structured prompt with numbered, checkable assertions gets a reliable
per-item verdict and surfaces the one thing that's wrong. Write the checklist
you'd hand a human QA: "is the axis linear 0–100?", "is the legend on the
right?", "is the warning badge amber, not red?".

**Cold start:** the first `zai-vision` call after daemon restart may time out
(STDIO server spinning up). Retry once. If it persists, `mcporter daemon
restart` and wait a few seconds.

Iterate: fix → rebuild → `?v=3` → screenshot → analyze, until the verdict is
OK. Two to four rounds is typical for a non-trivial artifact.

---

## See also

- `../SKILL.md` — top tools and the research loop
- `tools.md` — every tool, every param
- the `chrome-devtools` skill — capture half of this loop
