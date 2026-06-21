# deepthink skill

Tree-of-Thoughts reasoning skill for pi agents. When a problem is too complex for linear thinking, branch into hypotheses, evaluate each, and converge on the best path.

## Usage

Invoke the skill when facing a complex decision:

```
/skill:deepthink
```

Or let the agent auto-load it when the task matches.

## Methodology

1. **Diverge** — generate all possible hypotheses as flat paths in `paths.txt`
2. **Render** — build tree view for the big picture
3. **Evaluate** — research each branch (sub-agents in parallel)
4. **Converge** — decide, document, commit

## Deliverables

- `TREE.md` — complete tree with status markers
- `SYNTHESIS.md` — narrative summary and decision
- Git commit — snapshot of the thinking process