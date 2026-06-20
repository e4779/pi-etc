# zai-mcp skill

Web search, page-to-markdown, semantic GitHub-repo reads, and image/video
analysis — four Z.AI MCP servers wrapped behind `mcporter call`, without the
~8k-token schema dump that MCP tool listings load into context every turn.

Instead of exposing all 13 tools through mcporter's extension (each tool
description sits in the system prompt every turn), this skill teaches the agent
the two calls it actually needs 87% of the time. The full catalog and worked
recipes load **on demand** from `references/`.

## Prerequisites

- **`mcporter` CLI** installed and on PATH
- Four servers in `~/.mcporter/mcporter.json`: `zai-search`, `zai-reader`,
  `zai-zread` (HTTP), `zai-vision` (STDIO)
- **`Z_AI_API_KEY`** set in each server's `env` block

Verify:
```bash
mcporter list zai-search --brief
mcporter list zai-vision --brief
```

## What it does

- **Search** the web and **fetch pages as markdown** (the research loop)
- **Read a GitHub repo semantically** without cloning (`zai-zread`)
- **OCR screenshots**, analyze charts/diagrams, compare UI screenshots, and
  summarize videos (`zai-vision`, GLM-4.6V)

All through one CLI: `mcporter call zai-<server>.<tool> key=value ...`.
No daemon — these are stateless HTTP/STDIO servers.

## Structure

```
zai-mcp/
├── SKILL.md              # always-on: when to use + top tools + workflow (~1.5k tokens)
├── README.md             # this file (for humans)
└── references/
    ├── tools.md          # all 13 tools with full signatures (load on demand)
    └── recipes.md        # worked scenarios (load on demand)
```

## Token economics

| Approach | Tokens in system prompt (every turn) |
|---|---|
| `pi-mcporter` extension + 4 zai servers | ~8 000 (full schemas) |
| This skill (SKILL.md only) | ~1 500 |
| This skill + `references/tools.md` | ~3 500 (one-shot) |

## Related

- **`chrome-devtools`** skill — live JS pages that need clicks / login / network inspection
- Upstream: Z.AI MCP servers (`zai-search`, `zai-reader`, `zai-zread`, `zai-vision`)
- Wrapper CLI: [openclaw/mcporter](https://github.com/openclaw/mcporter)

## License

ISC
