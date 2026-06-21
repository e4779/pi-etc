# layout-check skill

CSS Layout Verification Skill — precise layout verification via coordinate tables and pairwise element relations.

Instead of relying on visual screenshot inspection, this skill extracts exact element positions via `getBoundingClientRect()` and computes spatial relationships: alignment, gaps, overlaps, and misalignments.

## Prerequisites

> **⚠️ Chrome DevTools MCP is REQUIRED.** This skill does NOT work without it. `layoutProbe` runs via `evaluate_script` inside a browser page — no DevTools protocol = no layout checks.

## Features

- **Coordinate tables** — markdown output optimized for LLM consumption
- **Pairwise relations** — bottom/top/left/right/center alignment, horizontal gaps, vertical gaps, overlaps
- **Auto-detect issues** — misalignment warnings with CSS fix suggestions
- **Before/after diff** — compare two layout snapshots to verify CSS fixes
- **Templates** — `row()`, `column()`, `grid()` shortcuts for common layout patterns
- **Structured data API** — `layoutProbe.structured()` for programmatic use

## Quick Usage

After installing, the agent reads `SKILL.md` automatically when layout tasks are detected.

```js
// Via chrome-devtools evaluate_script
layoutProbe({ selectors: { btn: '.button', input: 'input' } })
layoutProbe.row('.form-row')      // flex row children
layoutProbe.column('.form-stack') // flex column children
layoutProbe.grid('.card-grid')    // grid children
```

See `SKILL.md` for full step-by-step documentation.