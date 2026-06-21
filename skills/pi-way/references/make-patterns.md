# Make — The Orchestrator

Make is your telescope. **Data flows through it — recipes are lenses that focus and transform.**

```makefile
# Data pipeline: raw → processed → analyzed
data/raw/%.csv:
	curl -o $@ https://...

data/processed/%.json: data/raw/%.csv
	cargo xtask convert $< $@

data/results/report.md: data/processed/%.json
	# Agent reads data, writes findings
```

**Why Make**:
- Dependencies track what changed — only stale tasks re-run
- The Makefile IS the documentation — no separate README needed
- `make target` is a one-word command
- Files are the interface between agents

## Sub-agent workflow with Make

```
subs/
├── tasks/     # Task descriptions (commit to git)
├── data/      # Extracted data for agents (.gitignore)
└── results/   # Agent outputs (.gitignore)
```

```makefile
subs/results/research.md: subs/tasks/research.md subs/data/api-docs.txt
	# Agent: read task + data → write result
```

**Pre-extract data** for sub-agents. Don't make agents dig through external sources — write a script, save to `subs/data/`, feed to agent.