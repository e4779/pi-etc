# chrome-devtools skill

Drive a real Windows Chrome tab from a pi agent in WSL via the
`chrome-devtools` MCP — as **fabric natives** (`mcp.chrome_devtools.*` inside
`fabric_exec`), without the ~18k-token schema bloat that MCP tool listings dump
into context.

Instead of exposing all 29 tools through full MCP listings (every tool
description sits in the system prompt every turn), this skill teaches the agent
the few calls and workflows it actually needs. The full surface is reachable
on demand via `tools.describe({ ref: "mcp.chrome_devtools.<tool>" })` — live and
always current — and worked recipes load **on demand** from `references/`.

## Architecture (WSL → Windows Chrome)

Two Windows Chrome instances, driven from WSL over mirrored networking
(`127.0.0.1` shared between both sides):

| server | Chrome | port | use |
|---|---|---|---|
| `chrome-devtools` | direct instance | 9222 | default — real rendering |
| `chrome-devtools-proxy` | proxied instance | 9223 | blocked (foreign) sites via bypass proxy |

Both mapped in `~/.mcporter/mcporter.json` to
`--browserUrl http://127.0.0.1:922X`; fabric discovers them from there.

Verify inside any `fabric_exec`:

```ts
await mcp.chrome_devtools.list_pages({});
await tools.call({ ref: "mcp.$servers" });
```

## What it does

- Browser automation & scraping (navigate, snapshot, click, fill forms)
- Front-end debugging (console errors, network requests, computed styles)
- UI verification after code changes (snapshot diff, screenshots)
- Performance measurement (Core Web Vitals, traces)

All as native calls inside `fabric_exec`; the `mcporter call` CLI remains a
break-glass fallback.

## Structure

```
chrome-devtools/
├── SKILL.md              # always-on: when to use + top tools + workflow
├── README.md             # this file (for humans)
└── references/
    ├── setup.md          # first-run setup guide (load on demand)
    └── recipes.md        # worked end-to-end scenarios (load on demand)
```

The recipes in `references/recipes.md` are drawn from real scraping sessions
(finam.ru, MOEX, dohod.ru, ЦБ РФ, FRED — ~1300 recorded calls), not invented
examples.

## Token economics

| Approach | Tokens in system prompt (every turn) |
|---|---|
| Full MCP tool listings (chrome-devtools) | ~18 000 |
| This skill (SKILL.md only) | ~1 500 |
| On-demand `tools.describe` per tool | ~200 (one-shot) |

## Related

- **`chrome-css`** skill (in `pi-design-skill`) — ready-made `evaluate_script` patterns for `getComputedStyle` / box model
- **`layout-check`** skill (in this repo) — coordinate-table layout verification; pair with screenshots for visual regressions
- Upstream MCP: [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- MCP runtime config: `~/.mcporter/mcporter.json` (mcporter format, consumed by fabric)

## License

ISC
