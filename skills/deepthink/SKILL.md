---
name: deepthink
description: Structured Tree-of-Thoughts reasoning for complex decisions. Use when facing a hard problem with multiple hypotheses, trade-offs, or branches to explore.
---

# DeepThink — Tree of Thoughts

When facing a complex decision with multiple hypotheses or approaches, use this structured reasoning method. Instead of linear thinking, branch into parallel threads, evaluate each, and converge on the best path.

## The Model

```
Problem
├── Hypothesis A → evaluate → ❌ rejected
├── Hypothesis B → evaluate → ⚠️ promising but risky
├── Hypothesis C → evaluate → ✅ best fit
│   ├── Sub-approach C1 → ✅
│   └── Sub-approach C2 → ❌
└── Hypothesis D → evaluate → ⏸️ deferred
```

## Setup

```bash
# Create the tree workspace
touch paths.txt    # flat tree, one branch per line
# Format: path/to/branch # comment [status]
```

**Path format:** `/`-separated hierarchy, `#` comment, optional `[ ]`/`[~]`/`[✓]` status.

Example:
```
problem # What are we solving?
problem/hypothesis-a # Try approach A [✓]
problem/hypothesis-b # Try approach B [ ]
problem/hypothesis-b/sub-1 # Detail [ ]
```

## Workflow

### Phase 1: Diverge — generate hypotheses

Read the problem. Don't judge yet. Write ALL possible approaches as branches:

```bash
echo "problem/hypothesis-name # brief description" >> paths.txt
```

Use sub-agents if needed for creative exploration:
```
Agent({ subagent_type: "Explore", description: "Generate hypotheses", prompt: "..." })
```

### Phase 2: Render — build the tree

```bash
# Render tree (use tree-from-paths or tree command)
tree-from-paths paths.txt > TREE.md
```

Read `TREE.md` to see the full picture. Share with the user.

### Phase 3: Evaluate — research each branch

For each `[ ]` branch, research and evaluate:

```bash
# Show pending branches
grep "\[ \]" paths.txt
```

Delegate research to sub-agents:
```
Agent({ subagent_type: "researcher", description: "Evaluate hypothesis X", prompt: "Research...", run_in_background: true })
```

Mark branches as you go:
```bash
# Mark as in-progress
sed -i 's/\[ \]/[~]/' paths.txt  # specific branch
# Mark as done
sed -i 's/\[~\]/\[✓\]/' paths.txt
```

### Phase 4: Converge — decide

When enough branches are evaluated:
1. Rerender the tree: `tree-from-paths paths.txt > TREE.md`
2. Read TREE.md — see the full picture with statuses
3. Present findings to the user: which branches are promising, which are dead ends
4. Ask: «which path should we take?»
5. Document the decision as a new branch: `problem/decision # Chose approach [✓]`

## Status markers

| Marker | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | In progress (agent working) |
| `[✓]` | Done / evaluated |
| `[⏸️]` | Deferred |
| `[❌]` | Rejected |
| `[🔀]` | Fork / decision point |

## Utilities

```bash
tot-tree paths.txt > TREE.md      # render tree from flat paths
tot-add "path/branch" "comment"    # add branch + rebuild
tot-status paths.txt               # show pending [ ] branches
```

If utilities aren't available, use bash:
```bash
grep "\[ \]" paths.txt            # pending branches
# Generate tree manually or use awk one-liner from the TOT session
```

## Integration with sub-agents

For deep evaluation, dispatch sub-agents per branch:

```
# Phase 3: dispatch
for branch in $(grep "\[ \]" paths.txt | cut -d'#' -f1); do
  Agent({ subagent_type: "researcher", prompt: "Evaluate: $branch", run_in_background: true })
done
```

Use `steer_subagent` to redirect mid-research if an agent goes off track.

## When to use deepthink

- **Architecture decisions** — multiple valid approaches, need comparison
- **Debugging** — many possible causes, need systematic elimination
- **Design** — competing aesthetics or UX patterns
- **Research** — exploring a new domain with many unknowns
- **Planning** — decomposing a large goal into sub-tasks

## When NOT to use

- Simple, obvious tasks (just do it)
- Urgent fixes (act, then reflect)
- The user already knows what they want (don't overthink)

## Deliverable

At the end of a deepthink session:
1. `TREE.md` — complete tree with all evaluations
2. `SYNTHESIS.md` — narrative summary of findings and decision
3. Git commit — snapshot of the thinking process
