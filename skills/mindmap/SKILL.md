---
name: mindmap
description: >-
  Create, grow, or fix drawio mindmaps (.drawio): from an idea, a text
  outline, or notes — central node, one color per branch, curved organic
  edges in native mindmap styles. Use when the user asks for a mindmap /
  майндмапу / карту идей / concept map / brainstorm map, asks to beautify,
  re-layout, or QA an existing mindmap canvas, or to turn text into a visual
  map. Covers programmatic XML generation and drawio MCP round-trips. Not
  for other diagram types (drawio skill) and not for Socratic interview
  sessions (grill skill — it grows its canvas with these same references).
---

# Mindmap — drawio mindmaps end to end

Build or edit a mindmap canvas. The .drawio file is the artifact; a text
outline is a by-product on request.

Theory (Buzan's laws adapted to drawio):
[references/mindmap-design.md](references/mindmap-design.md).
Generation mechanics, MCP calls, QA loop:
[references/drawio-recipe.md](references/drawio-recipe.md).

## Workflow

1. **Canvas**: reuse the file the user names, or create
   `<project>/docs/<topic>.drawio`. If draw.io Desktop has it open, ask the
   user to SAVE before each of your write rounds — unsaved app edits clobber
   MCP writes and vice versa.
2. **Skeleton**: one central ellipse node in native mindmap styles
   (recipe, "Generation"). Never assemble styles from memory — clone from a
   file the app saved.
3. **Content**: if starting from text, split it into atoms first — 1-3
   keywords per node, one idea per node, <=9 first-level branches, depth <=4
   (design reference, hard rules). Splitting "X and Y" into two nodes is the
   thinking.
4. **Layout**: one fillColor per first-level subtree; curved thick-to-thin
   edges; related branches adjacent. Radial "sun" for exploration,
   right-flowing tree when reading order matters.
5. **QA loop**: recipe, "QA loop" — validate, render, vision-check, fix,
   re-render. On this machine there is no drawio CLI: validate with
   ElementTree and round-trip through the drawio MCP
   (`tools.search("drawio")` finds it — tools.list caps at 100 and hides it),
   then judge via screenshot + vision if a browser path exists.
6. **Hand-off**: offer the extracted indented outline; commit the canvas if
   it lives in a repo.
