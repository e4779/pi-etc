# qwen-flavor extension

This extension activates Qwen Code system prompt and tool style for Qwen models.

## Usage

Type `/qwen-flavor` — the system prompt switches to Qwen Code's prompt. Type `/qwen-flavor` again to return to pi's default prompt.

```
/qwen-flavor    → enable Qwen Code system prompt
/qwen-flavor    → toggle off (return to pi default)
```

## What it changes

When enabled, the extension replaces pi's default system prompt with Qwen Code's prompt:

- **Core Mandates** — project conventions, library verification, style mimicry, no comments
- **Primary Workflows** — Plan → Implement → Adapt → Verify
- **Tone & Style** — concise output (≤3 lines), no chitchat, direct answers
- **Security Rules** — explain critical commands, security-first approach
- **Executing Actions with Care** — layered confirmation for risky operations
- **Tool Call Examples** — model-aware examples (qwen-coder models get XML-style, others get general style)
- **Pi-Specific Instructions** — added at the end (available tools, @file syntax, skills, templates)

## When to use

- When working with Qwen models (Qwen 3.6, Qwen 3.5, Qwen Coder, etc.)
- The prompt is tuned for models trained on Qwen Code's data
- You want the "native" Qwen Code experience inside pi

## Notes

- A warning is shown if you enable it with a non-Qwen model
- The prompt adapts examples based on the current model (coder → XML, others → general)
- Works with all pi tools: read, write, edit, bash, grep, find, ls