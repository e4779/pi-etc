---
status: done
---

# Delete skill: github — MCP-transport duplicate, contour dead

Verdict OVERTURNED by operator 2026-11-19: DELETE.

Same doctrine as gh-cli through mcp.github.* natives; written for a
contour without gh installed ("Never gh CLI (not installed)"), and no
machine has the github MCP server configured anymore (hlab mcporter:
chrome/mcpls/memos/zai only). gh-cli won the transport war.

- [x] git rm skills/github/
- [x] Dir-wide ./skills glob needs no root edit; package manifest never listed it
- [x] tsk check green (pre-commit)
