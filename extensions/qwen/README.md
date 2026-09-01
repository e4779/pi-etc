# qwen-flavor extension

Adapts Qwen models to pi. Two modes, selected automatically by detecting Fabric:

| Mode | When | What it does |
|------|------|--------------|
| **Fabric addendum** | `pi-fabric` package active and `fullCodeMode !== false` (default) | Appends a compact behavioral addendum to the chained system prompt. No prompt swap, no tool overrides. |
| **Legacy full flavor** | No Fabric, or `fullCodeMode: false` | Replaces pi's system prompt with Qwen Code's prompt and overrides `edit` with the Qwen Code-style tool (old-style `file_path`/`old_string`/`new_string`). |

## Usage

```
/qwen-flavor    → toggle on/off (mode is picked automatically)
```

On session start with a Qwen model, the extension offers to enable itself (message text depends on the active mode).

## Why the Fabric mode is minimal

Under Fabric full-code mode `fabric_exec` is the only tool, which already solves what the legacy mode patched:

- **Edit-format errors** — `pi.edit` inside programs normalizes Qwen-style spellings (`old_string`, `new_string`, `file_path`, `replace_all` → `all`, …) and the type-checker returns an actionable error the model fixes on retry. A same-name edit override would only narrow that surface.
- **Malformed tool-call emission** — one tool schema instead of 7+ makes tool use far more reliable for Qwen models.
- **System prompt swap is harmful** — Qwen Code's prompt teaches direct tool calls with XML examples, contradicting the "write one TS program" contract. Fabric's session guidance stays authoritative; only the behavioral addendum is appended.

The addendum (`fabric-addendum.ts`) is distilled from the current Qwen Code system prompt (`QwenLM/qwen-code`, `packages/core/src/core/prompts.ts`) and keeps only what is both Qwen-specific and not covered by pi + Fabric: no early stopping, faithful outcome reporting, retry-from-error instead of tactic-flipping, scope discipline, in-project library verification, comment policy, preserving user changes, not routing around denied calls.

## Always-on safety net

The `message_end` hook extracting tool calls hidden as XML inside `<thinking>` blocks runs in both modes. Under Fabric it rarely fires, but it is the only rescue when the model fails to emit a proper `tool_use` block at all.

## Fabric detection

`isFabricFullCode(cwd)` reads `~/.pi/agent/settings.json` (package list) and then `fullCodeMode` from `<project>/.pi/fabric.json` (project override) or `~/.pi/agent/fabric.json`, defaulting to `true`. Result is cached per cwd for the session.

## Legacy-mode notes

- The Qwen-style edit override registers once per session; pi has no unregister API, so it persists until restart even after toggling off.
- Legacy mode adapts tool-call example style by model (qwen-coder → XML, qwen-vl → VL, else general).
