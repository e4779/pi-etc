---
name: grill
description: >-
  Socratic refinement sessions that grow a visual mindmap. Use when the user
  wants to think through, elaborate, or de-fog an idea, task, or project
  before execution — interview rounds with one question at a time, each round
  growing a drawio mindmap canvas via the drawio MCP. Ends with a text outline
  ready for downstream specs or task cards. Not for implementation work.
  RU: распарировать идею, продумать вслух до реализации, прояснить задачу вопросами.
---

# Grill — question rounds growing a drawio mindmap

Refine a foggy idea through question rounds while building its visual map.
The canvas (.drawio) is the source of truth; the text outline is extracted
on finish. Mindmap theory and drawio mechanics live in the `mindmap` skill:
[../mindmap/references/mindmap-design.md](../mindmap/references/mindmap-design.md)
and [../mindmap/references/drawio-recipe.md](../mindmap/references/drawio-recipe.md).

## Session start

1. Canvas location: reuse an existing file the user names, or create
   `<project>/docs/grill/<topic>.drawio` (ask if unclear).
2. Missing/empty → create the skeleton: one central node with the idea in
   native mindmap styles (recipe, step "skeleton").
3. If the file is open in draw.io Desktop, ask the user to SAVE before each
   of your write rounds — unsaved app edits clobber MCP writes and vice versa.

## Rounds

Each round:

1. Internally list the open questions (the frontier). Pick the single
   highest-leverage one — the answer that clears the most fog.
2. Ask exactly ONE question. State your recommended answer with it, so the
   user can reply "yes/no". Never stack multiple questions in one message.
3. On answer: update the canvas via drawio MCP — get_page, modify the cell
   list, set_page. Add branches as nodes with cloned native mindmap styles.
   Resolved → settle the node; new fog → child nodes as questions-in-waiting.
4. Narrate one line of what changed on the map.

Repeat until no sharp question remains (the frontier is empty).

## Ungrillable questions

"How should this look/feel" cannot be settled by talk. Mark the node,
propose a throwaway prototype, and return when there is something to react
to. Never balloon rounds rephrasing an ungrillable question.

## Layout discipline

Follow [../mindmap/references/mindmap-design.md](../mindmap/references/mindmap-design.md). Hard
rules: 1–3 keywords per node (never sentences), ≤9 first-level branches,
depth ≤4, one color per first-level branch, curved edges, related branches
adjacent. Radial "sun" for exploration; right-flowing logic tree when
reading order matters — both are legitimate layouts.

## Finish

When the frontier empties:

1. Export PNG at `-s 2`, vision-check the layout, fix coordinates, re-export.
2. Extract the outline: walk the tree depth-first, emit an indented list.
3. Offer downstream: code work → draft an OpenSpec proposal from the outline;
   other → task cards for agent dispatch.
4. Commit the canvas if it lives in a repo.

## Stop conditions

Hand back to the user when: an irreversible decision appears, a question
needs their authority, or they signal session fatigue. The canvas survives —
the next /grill resumes from it.