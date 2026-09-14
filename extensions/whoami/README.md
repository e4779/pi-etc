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

## Why not an existing extension

Closest pi packages are UI-level (pi-statusline, pi-starship,
pi-powerline-footer show the model in the footer — for the *user*), not
prompt-level (for the *model*). This extension replicates the standard
harness pattern at prompt level.
