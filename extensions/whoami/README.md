# whoami — model identity in the system prompt

pi's built-in system prompt never names the model, so models frequently
misidentify themselves ("I am ChatGPT" from a GLM, etc.). Every mature
harness injects identity natively — Claude Code and ZCode via
"You are powered by the model named X", OpenCode in `session/system.ts`.
No pi extension did this (surveyed 2026-09: narumiruna/pi-extensions,
ogulcancelik/pi-extensions, nicobailon/*, npm `pi-*`), hence this one.

## What it does

On `before_agent_start` it **appends** (never replaces) a compact section:

```
## Model Identity
- You are powered by the model `zai/glm-5.3-flash` (GLM-5.3-Flash).
- Your strengths — lean into them: fast, token-efficient workhorse ...; 1M-token context.
- When asked which model or product you are, answer from this section. ...
```

- Idempotent (marker check) — safe across retries and compaction re-runs.
- Curated strengths for the models we run; unknown models get identity-only.
- Zero configuration. Extend `PROFILES` in `index.ts` when adding models.

## Adding a model profile — behavioral strengths, not technical specs

When adding a model to `PROFILES`, write **behavioral** strengths, not
**technical characteristics**. Specs rot; behavior is durable.

**Don't write:** context window size, max output tokens, parameter count,
quantization, architecture details. These live in `~/.pi/agent/models.json`
(the harness's model registry) and differ per hosting — the same model id
can expose 1M context on one endpoint and ~200K on another. Hardcoding a
spec in the prompt makes the model believe a lie when the config changes.

**Do write:** prompting style, unique behavioral features, failure modes,
tool-selection behavior — things that change how you *use* the model, not
what the model *is* on paper.

| Good (behavioral, durable) | Bad (specs that rot) |
|---|---|
| "Preserved Thinking — reasoning carries across turns" | "200K context, 128K output" |
| "high-level goals, not step-by-step micromanagement" | "744B MoE, 40B active" |
| "PROMPT-SENSITIVE — use 6-element framework, be explicit" | "262K context, 32K output, 27B" |
| "no native reasoning — keep reasoning external" | "128K context, 16K output" |

If a number is genuinely behavioral (e.g. "keep working context under ~60K
— attention degrades at scale" for a 27B model), phrase it as guidance,
not spec. The threshold is a recommendation, not a hard limit.

If the model or user needs exact specs, point at `models.json` or the
provider's model card — don't transcribe them into the prompt.
## Why not an existing extension

Closest pi packages are UI-level (pi-statusline, pi-starship,
pi-powerline-footer show the model in the footer — for the *user*), not
prompt-level (for the *model*). This extension replicates the standard
harness pattern at prompt level.
