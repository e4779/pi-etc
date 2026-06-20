# chrome-devtools skill

Drive a real Chrome tab from a pi agent via the `chrome-devtools` MCP — without
the ~18k-token schema bloat that MCP tool listings dump into context.

Instead of exposing all 29+ tools through `mcporter`'s extension (which loads
every tool description into the system prompt every turn), this skill teaches the
agent the few calls and workflows it actually needs. Full tool reference and
worked recipes load **on demand** from `references/`.

This is the [pi-way](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
answer to the chrome-devtools MCP — progressive disclosure over schema dumps, and
exactly the pattern [mcporter's own agent-skills
guide](https://github.com/openclaw/mcporter/blob/main/docs/agent-skills.md)
recommends ("one small skill per MCP server").

## Prerequisites

- **`mcporter` CLI** installed (`npm i -g mcporter`) and on PATH
- **`chrome-devtools` server** configured in `~/.mcporter/mcporter.json`
- **Chrome** installed (or set `--executablePath` / `--browserUrl` in the server
  config)

Verify:
```bash
which mcporter
mcporter list chrome-devtools --brief    # confirms the server is reachable
mcporter daemon status                   # chrome-devtools needs the keep-alive daemon
```

## What it does

The skill turns these tasks into a handful of `mcporter call` commands:

- Browser automation & scraping (navigate, read DOM, click, fill forms)
- Front-end debugging (console errors, network requests, computed styles)
- UI verification after code changes (snapshot diff, screenshots)
- Performance measurement (Core Web Vitals, traces)

Everything goes through one CLI: `mcporter call chrome-devtools.<tool> ...`. The
keep-alive daemon keeps Chrome alive across calls.

## Structure

```
chrome-devtools/
├── SKILL.md              # always-on: when to use + top tools + workflow (~1.5k tokens)
├── README.md             # this file (for humans)
└── references/
    ├── tools.md          # full catalog of all tools (load on demand)
    └── recipes.md        # worked end-to-end scenarios (load on demand)
```

The agent reads `SKILL.md` automatically when a task matches, and only pulls in
`references/` when the task actually needs console / network / perf / memory /
emulation details. That's the whole point — pay the token cost only when needed.

The recipes in `references/recipes.md` are drawn from real scraping sessions
(finam.ru, MOEX, dohod.ru, ЦБ РФ, FRED — ~1300 recorded `mcporter call`s),
not invented examples.

## Token economics

| Approach | Tokens in system prompt (every turn) |
|---|---|
| `pi-mcporter` extension + chrome-devtools MCP | ~18 000 (full schema) |
| This skill (SKILL.md only) | ~1 500 |
| This skill + `references/tools.md` loaded | ~6 000 (one-shot) |

The 29-tool schema is paid for *only in the turns where it's actually needed*.

## Related

- **`chrome-css`** skill (in `pi-design-skill`) — ready-made `evaluate_script`
  patterns for `getComputedStyle` / box model
- **`layout-check`** skill (in this repo) — coordinate-table layout verification;
  pair with screenshots for visual regressions
- Upstream MCP: [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- Wrapper CLI: [openclaw/mcporter](https://github.com/openclaw/mcporter)

## License

ISC
