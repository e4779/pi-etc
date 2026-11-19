---
name: layout-check
description: "CSS layout verification via coordinate tables. Computes pairwise element relations (alignment, gap, overlap, misalign) from getBoundingClientRect. Use to verify layout fixes, check alignment, compare before/after CSS changes. RU: проверь вёрстку, съехала вёрстка, выравнивание, наложение элементов, сравни до/после."
---

# Layout Check

Verify CSS layout using **exact element coordinates** instead of screenshots. This skill provides `layoutProbe` — a function that collects DOM element positions and computes spatial relationships: alignment, gaps, overlaps, misalignments.

## Prerequisites

**Chrome DevTools MCP is REQUIRED.** This skill cannot function without it.

- `evaluate_script` — executes `layoutProbe` in the browser
- `take_snapshot` — gets element UIDs for uid-based checks (Step 3)

If your agent doesn't have Chrome DevTools MCP, install it first:
```bash
# For pi:
npm install -g @anthropic/chrome-devtools-mcp
```

## When to Use This Skill

Use `layout-check` to:

- Check if elements in a row/column are aligned
- Verify CSS changes didn't shift elements
- Find overlapping elements
- Measure exact gaps between elements
- Compare layout before and after changes

**Do NOT use** for colors, fonts, shadows — use screenshots for those.

## How It Works

1. Call `evaluate_script` with `layoutProbe` code and CSS selectors
2. `layoutProbe` calls `getBoundingClientRect()` on each element
3. Returns a markdown table with coordinates and a relations list

---

## Step 1: Read the layoutProbe Script

Before first use, **read the script file**. You'll paste its contents into every `evaluate_script` call.

```
read skills/layout-check/scripts/layoutProbe.mjs
```

Save the content — you'll insert it in each `evaluate_script` call.

---

## Step 2: Basic Check (CSS Selectors)

The simplest way — pass CSS selectors. `layoutProbe` finds all matching elements.

### Copy-Paste Template

Replace `<LAYOUTPROBE_CODE>` with the contents of `layoutProbe.mjs`, and replace selectors with your own:

```js
() => {
  <LAYOUTPROBE_CODE>

  return layoutProbe({
    selectors: {
      'button': '.my-button',
      'input': '.my-input'
    }
  });
}
```

### Example

```js
() => {
  // ... code from layoutProbe.mjs ...

  return layoutProbe({
    selectors: {
      'prefix': '.react-js-cron-field .bodyM',
      'select': '.react-js-cron-field [role=combobox]'
    }
  });
}
```

### What You Get

```markdown
### Elements

| name | text | top | left | bottom | right | w | h |
|------|------|-----|------|--------|-------|-----|-----|
| prefix | Every | 70 | 117.4 | 100 | 180.3 | 63 | 30 |
| select | Frequency | 40 | 190.3 | 100 | 298.5 | 108.2 | 60 |

### Relations

- prefix ↔ select: bottom=100
- prefix → select: gap=10px
```

---

## Step 3: Check via take_snapshot (UID)

For specific elements (not all matched by selector), use `take_snapshot` + `evaluate_script` with `args`.

### Copy-Paste Template

**First:** call `take_snapshot` and note the UIDs of target elements (e.g., `1_2` and `1_3`).

**Then:** copy-paste this into `evaluate_script`:

```json
{
  "function": "(el0, el1) => {\n<LAYOUTPROBE_CODE>\nreturn layoutProbe({ elements: [el0, el1] });\n}",
  "args": ["1_2", "1_3"]
}
```

The first UID becomes `el0`, second becomes `el1`. Add `el2`, `el3` etc. for more elements.

---

## Step 4: Templates — row, column, grid

Ready-made templates for common checks. They take **all direct children** of a parent element.

### Flex Row

```js
() => {
  <LAYOUTPROBE_CODE>
  return layoutProbe.row('.my-form-row');
}
```

Finds all children of `.my-form-row`, checks horizontal alignment.

### Flex Column

```js
() => {
  <LAYOUTPROBE_CODE>
  return layoutProbe.column('.form-stack');
}
```

Finds all children of `.form-stack`, checks vertical alignment.

### Grid

```js
() => {
  <LAYOUTPROBE_CODE>
  return layoutProbe.grid('.card-grid');
}
```

Finds all children of `.card-grid`, checks both directions.

---

## Step 5: Before/After Comparison

Verify that CSS changes didn't break layout:

```js
() => {
  <LAYOUTPROBE_CODE>

  // 1. Measure BEFORE
  const before = layoutProbe.structured({
    selectors: { 'btn': '.button', 'input': 'input' }
  });

  // ... modify CSS or DOM here ...

  // 2. Measure AFTER
  const after = layoutProbe.structured({
    selectors: { 'btn': '.button', 'input': 'input' }
  });

  // 3. Compare
  return layoutProbe.compare(before, after);
}
```

Output shows what changed:

```
~ btn.top: 10 → 15
~ btn.left: 20 → 25
+ relation: btn ↔ input: gap=15px
- relation: btn ↔ input: gap=10px
```

- `~` — value changed
- `+` — new relation appeared
- `-` — relation disappeared
- `No changes detected.` — nothing changed

---

## How to Read the Output

### Elements Table

Each row is one element:

| Column | Meaning |
|--------|---------|
| name | Element name (from selector or `el-0`, `el-1`) |
| text | Element text (first 15 chars) |
| top, left | Top-left corner coordinates |
| bottom, right | Bottom-right corner coordinates |
| w, h | Width and height |

### Relations Section

Pairwise spatial relationships:

| Format | Meaning |
|--------|---------|
| `a ↔ b: top=10` | Aligned by top edge |
| `a ↔ b: bottom=50` | Aligned by bottom edge |
| `a ↔ b: left=20` | Aligned by left edge |
| `a ↔ b: right=100` | Aligned by right edge |
| `a ↔ b: center-x=60` | Aligned by horizontal center |
| `a ↔ b: center-y=30` | Aligned by vertical center |
| `a → b: gap=10px` | Horizontal gap from a to b |
| `a ↓ b: vgap=10px` | Vertical gap from a to b |
| `a ↔ b: overlap=10px` | Horizontal overlap |
| `a ↔ b: voverlap=10px` | Vertical overlap |
| `misalign-bottom=5px` | Not aligned by bottom (5px off) |

### Issues Section (Auto-Detect)

If problems are found, an `### Issues` section appears with suggestions:

```
### Issues

⚠ a ↔ b: misalign-bottom=5px
  → try align-items: center or baseline on the parent
⚠ a ↔ b: overlap=10px
  → elements overlap horizontally. Check width or flex-shrink.
```

---

## layoutProbe Options

```js
layoutProbe({
  selectors: { ... },   // CSS selectors { name: '.class' }
  elements: [...],       // DOM elements (from evaluate_script args)
  threshold: 2,          // Alignment tolerance in px (default 2)
  relations: true,       // Compute relations (default true)
  issues: true           // Auto-detect problems (default true)
})
```

### threshold (tolerance)

- Difference < threshold → elements considered aligned
- Difference < threshold+5 → shows `misalign-*`
- Difference > threshold+5 → relation not shown

Increase threshold for approximate alignment checks (e.g., `threshold: 5`).

---

## Common Scenarios

### Check Toolbar Button Alignment

```js
() => {
  <LAYOUTPROBE_CODE>
  return layoutProbe.row('.toolbar');
}
```

Look for `top=` and `bottom=` in Relations — if present, buttons are aligned.

### Check if Button Shifted After Error Message

```js
() => {
  <LAYOUTPROBE_CODE>

  const before = layoutProbe.structured({ selectors: { btn: '.submit-btn' } });

  // ... trigger validation error ...

  const after = layoutProbe.structured({ selectors: { btn: '.submit-btn' } });

  return layoutProbe.compare(before, after);
}
```

Look for `~ btn.top: X → Y` — if changed, button shifted.

### Check Uniform Gaps in Card List

```js
() => {
  <LAYOUTPROBE_CODE>
  return layoutProbe.grid('.card-list');
}
```

All `gap=` values between adjacent cards should be equal.

### Find Overlapping Elements

```js
() => {
  <LAYOUTPROBE_CODE>
  return layoutProbe({ selectors: { 'all': '.widget *' } });
}
```

Look at Issues for `overlap=` or `voverlap=`.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Empty Elements table | Check selectors. Run `document.querySelectorAll('.your-selector')` in browser console |
| No Relations section | Need at least 2 elements. Check `relations: true` |
| Wrong coordinates | Elements might be hidden (display:none) — coordinates are 0 |
| `layoutProbe is not defined` | Forgot to paste code from `layoutProbe.mjs` into function body |
| Too many misalign | Increase `threshold` (e.g., `threshold: 5`) |

---

## Full API Reference

```js
// Main — returns markdown or TOON string
layoutProbe(options)
layoutProbe({ ..., format: 'toon' })     // ~30% fewer tokens
layoutProbe({ ..., styleAware: true })   // CSS-aware analysis

// Structured data (for compare and automation)
layoutProbe.structured(options)  // → { elements, relations, issues }

// Before/after diff
layoutProbe.compare(before, after)  // → diff string

// Templates (styleAware enabled by default)
layoutProbe.row('.parent-selector')     // Flex row + CSS analysis
layoutProbe.column('.parent-selector')  // Flex column + CSS analysis
layoutProbe.grid('.parent-selector')    // Grid + CSS analysis
```

### CSS-Aware Analysis (styleAware)

When `styleAware: true` and a `container` is specified, `layoutProbe` reads `getComputedStyle` of the container and compares declared CSS with actual measurements:

- **gap mismatch** — CSS says `gap: 8px` but actual gaps are 15px
- **align-items mismatch** — `align-items: center` but children are not centered
- **justify-content mismatch** — `space-between` but edges don't touch container edges
- **gap inconsistency** — uneven spacing between children
- **grid info** — prints `grid-template-columns` for grid containers

```js
// Templates enable styleAware automatically
layoutProbe.row('.form-row')

// Or manually
layoutProbe({ selectors: { ... }, container: '.wrapper', styleAware: true })

// Disable for templates
layoutProbe.row('.form-row', { styleAware: false })
```

### TOON Format

For token-sensitive contexts, use `format: 'toon'` — outputs in TOON notation (~30% more compact than markdown):

```js
layoutProbe({ selectors: { btn: '.btn' }, format: 'toon' })
```

Output:
```
[2]{name,text,top,left,bottom,right,w,h}:
  btn,Click,10,20,50,100,80,40
  input,Search,10,120,50,200,80,40

# Relations [3]
  btn ↔ input: bottom=50
  btn ↔ input: top=10
  btn → input: gap=20px

# Issues [1]
  ⚠ btn ↔ input: voverlap=40px | → try adding margin or padding
```

Parsable by `toonq` CLI and `serde_toon` (Rust) / `toons` (Python).

---

## Related Files

- `scripts/layoutProbe.mjs` — the script (read before use)
