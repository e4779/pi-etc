---
name: rlm-way
description: The RLM way — code-first agent work on vanilla pi. Persistent REPL as working memory, files as truth, recursion via subprocess (pisub / pi -p), context economy. Use when the task involves multi-step computation, data wrangling, repeated shell/tool calls, or when context is rotting.
---

# The RLM Way

Agent = code in a persistent REPL. Context is what you print, not what you know.

On vanilla pi: `python_repl` (@nteract/pi) is the kernel; `read`/`write`/`edit`/`bash` stay for what they do best. This is pi-way grown a compute engine, not prime-agent's single-tool extreme.

## The four layers (climb in order)

1. **REPL is cache.** Load data into variables once (`df = pl.read_csv("x.csv")`); fifty turns later it is still there — zero context tokens. Print summaries (`df.head()`, aggregates), never raw dumps.
2. **Code is action space.** Prefer one cell that loops / retries / branches over ten tool calls. A traceback is data: fix and rerun, don't start over.
3. **Recursion.** Sub-LLM calls happen from code, not from the chat channel:
   ```python
   import subprocess, json
   r = subprocess.run(["pisub", "run", "research X, reply with JSON only"],
                      capture_output=True, text=True)
   data = json.loads(r.stdout)
   ```
   The subagent's context never pollutes yours; the result lands in a variable. One-shot → `pisub run` (or `pi -p`); long-running/steerable → `pisub spawn` + `send`/`steer`. MCP → `mcporter call <server>.<tool>` the same way.
4. **Artifacts.** The code you wrote IS the workflow: save the kernel (`python_save_notebook`) for the log, move proven functions into real files, keep PLAN.md / TODO.md as always. Kernel RAM dies with the session — files don't.

## Division of labor

| Concern | Home |
|---|---|
| Computation, exploration, orchestration | `python_repl` |
| State that must survive | files (PLAN.md, TODO.md, source) |
| Shell / MCP / subagents | `subprocess` from kernel — or native tools when UX matters (edit diffs, streaming bash) |
| Background processes | tmux (unix) / pwsh jobs (windows); the kernel is for compute only |

## Smells (you are doing it wrong when…)

- The REPL sees only one-liners — calculator mode; compose functions instead.
- A huge blob gets printed into context — that is context rot with extra steps; print the aggregate.
- Truth lives in kernel RAM between sessions — it dies with the kernel; file it.
- Twenty grep-in-bash round trips where one cell with glob + filter + summary would do.
- Everything forced through Python when a native `edit` diff or a quick `read` is clearer — code-first, not code-only.
