# Mindmap design — theory into drawio practice

## Buzan's laws (1974, "Mind Map Mastery") — digital adaptation

1. **Central image** — the idea in the middle, bigger than everything. In
   drawio: the ellipse center node, 1.5–2x the size of branch nodes.
2. **Images/symbols** — hand-drawn pictures become shapes/icons; use
   sparingly (one per major branch at most, else noise).
3. **Color** — one color per first-level branch. Clusters become scannable;
   recall improves. Apply fillColor per branch subtree.
4. **Curved organic branches, thick to thin** — in drawio:
   entityRelationEdgeStyle + curved=1, no arrows; emulate taper by
   strokeWidth 2 on level-1 edges, 1 deeper.
5. **One keyword per line** — a node holds 1-3 words, never a sentence.
   Compression forces precise naming; sentences hide their atoms.
6. **Each idea gets its own branch** — if you write "X and Y" in one node,
   that is two nodes. Splitting is the thinking.
7. **Hierarchy — Basic Ordering Ideas (BOI)** — first level = 5±2 "chapter"
   branches. This is the working-memory budget (Miller 7±2).
8. **Radiant structure** — association radiates outward from the center.
9. **Personal style** — idiosyncratic phrasing aids memory; do not sanitize
   the user's words.
10. **Redraw/revise** — redrawing consolidates understanding. Cheap here:
    re-render after rounds; it is the built-in review.

## Layout patterns — when to use which

| Layout | Shape | Best for |
|---|---|---|
| Radial "sun" | center + fan in all directions | exploration, brainstorm, balanced association; structure still being discovered |
| Right-flowing logic tree ("grape bunch") | root at left, chains to the right | reading order, execution plans, argument chains, documentation |
| Bottom-up tree | conclusion at top, reasons below | argument/justification maps |

Both sun and grape bunch are legitimate — they answer different questions
(sun: "what is related?"; tree: "what follows from what?"). Do not mix
directions within one level. A hybrid is fine when quadrants stay coherent.

## Sub-topic vs branching (terminology)

- **Main branches** = the BOI level: 5±2 top areas, the "chapters" of the map.
- **Branching** = the act of splitting: one idea per branch. If a node reads
  "X and Y", it is two nodes — the split forces you to name each precisely.
- **Sub-topic** = any node below level 1. Depth budget: max 4 levels; deeper
  → regroup or spin a sub-map (a drawio page or separate file).

## Cognitive constraints (why the rules exist)

- Working memory = 7±2 chunks → first-level fan max 9.
- Keyword compression = forced encoding: naming an atom beats paraphrasing.
- Color clustering aids recall and rapid scanning.
- Semantic adjacency: related branches sit adjacent; crossing edges are a
  layout smell, not a style choice.

## drawio-specific tips

- Template styles: ellipse center; rounded=1;arcSize=50 topics;
  partialRectangle leaves (bottom-line only); entityRelationEdgeStyle
  curved edges without arrows.
- Generate via drawio MCP (get_page → modify → set_page); geometry attribute
  must be as="geometry".
- Export PNG at -s 2 and review with a vision model: overlaps, truncation,
  edges-through-nodes. Fix coordinates, re-export. One or two iterations
  usually suffice.
