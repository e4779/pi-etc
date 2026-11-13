# Drawio programmatic recipe — quick reference

This file is self-contained for the skill.

## The pitfall

Geometry cells must be `<mxGeometry ... as="geometry"/>`. Using
`as="mxGeometry"` is well-formed XML that validates fine, but drawio does
not bind it: nodes lose geometry, render as label slivers at (0,0), and CLI
export yields a ~40x27 px crop. Check exported PNG IHDR dimensions when in
doubt.

## Generation

1. Clone styles verbatim from a file the app saved (native template). For
   mindmaps the load-bearing attributes: swimlane containerType=tree;
   nodes treeFolding=1;treeMoving=1;newEdgeStyle={...}; edges
   edgeStyle=entityRelationEdgeStyle;curved=1, no arrows.
2. Escape attribute values: &quot; for quotes inside newEdgeStyle,
   &amp; &lt; &gt; for the rest.
3. Validate with ElementTree, then export before shipping.
4. When debugging render failures, mutate a known-good file instead of
   assembling from scratch.

## drawio MCP (via mcporter: mcp.drawio.*)

Discover refs with `tools.search("drawio")` — `tools.list` pages at 100 and
servers sorted past the cap look missing (a whole session once "lost" drawio
this way).

- list_pages {path} -> ids/names/sizes.
- get_page {path, page: "<page NAME>"} -> page mxGraphModel text. page is
  the NAME string, not an index.
- set_page {path, page, content} -> surgical page write; drawio
  re-serializes itself, envelope stays intact.
- Pool/Lane/Note: Pool = swimlane with childLayout=stackLayout; a shape
  dropped in a lane gets parent=<lane id> — board state is the parent map.

## CLI

- Export: drawio -x -f png -e -b 10 -s 2 -o out.png in.drawio
- Mermaid -> drawio and --layout (ELK: radialTree/horizontalTree/organic):
  need desktop build >= 31.x (29.7.9 lacks both — check --help).
- Version: PowerShell (Get-Item 'C:\Program Files\draw.io\draw.io.exe').VersionInfo.ProductVersion
- Update: download release installer, verify SHA256 against
  Files-SHA256-Hashes.txt (match exact filename — arm64 lines share the
  substring), taskkill draw.io.exe, install /S.

## QA loop

Export at -s 2 -> multimodal critique of the PNG (overlaps, truncation,
edges through nodes, balance) -> fix coordinates -> re-export. Judge by IHDR
dimensions + vision, never byte size.

No drawio CLI on this machine (native Linux; the `drawio -x` and
PowerShell-version notes above are Windows/WSL history). There: validate the
XML with ElementTree, round-trip through the drawio MCP (set_page then
get_page — drawio re-serializes and stays the authority), and screenshot +
vision-check if a browser path exists. `pi.bash` raises on nonzero exit —
pass `settle=True` for probing commands (a failed glob is not a crash).