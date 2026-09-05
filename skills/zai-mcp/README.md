# zai-mcp skill

Web search, page-to-markdown, semantic GitHub-repo reads, and image/video
analysis — four Z.AI MCP servers called as **fabric natives**
(`mcp.zai_search.*` etc. inside `fabric_exec`), without the ~8k-token schema
dump that MCP tool listings load into context every turn.

Under fabric the MCP runtime is mcporter-based: servers live in
`~/.mcporter/mcporter.json`, fabric discovers them automatically and binds
each tool as `mcp.<server>.<tool>()` (hyphens → underscores). No CLI spawn,
no shell quoting — results come back as values.

## Prerequisites

- Servers in `~/.mcporter/mcporter.json`: `zai-search`, `zai-reader`,
  `zai-zread` (HTTP), `zai-vision` (STDIO)
- **`Z_AI_API_KEY`** in `zai-vision`'s `env`; `Authorization` header on the
  HTTP servers

Verify inside any `fabric_exec`:

```ts
await tools.call({ ref: "mcp.$servers" });
```

## What it does

- **Search** the web and **fetch pages as markdown** (the research loop)
- **Read a GitHub repo semantically** without cloning (`zai-zread`)
- **OCR screenshots**, analyze charts/diagrams, compare UI screenshots, and
  summarize videos (`zai-vision`, GLM-4.6V)

All as native calls inside `fabric_exec`; the `mcporter call` CLI remains a
break-glass fallback. No daemon — these are stateless HTTP/STDIO servers.

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
| Full MCP tool listings (4 zai servers) | ~8 000 |
| This skill (SKILL.md only) | ~1 500 |
| This skill + `references/tools.md` | ~3 500 (one-shot) |

## Related

- **`chrome-devtools`** skill — live JS pages that need clicks / login / network inspection
- Upstream: Z.AI MCP servers (`zai-search`, `zai-reader`, `zai-zread`, `zai-vision`)
- MCP runtime config: `~/.mcporter/mcporter.json` (mcporter format, consumed by fabric)

## License

ISC
