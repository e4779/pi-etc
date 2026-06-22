# pisub Profiles — Reusable Agents as Shell Scripts

pisub is intentionally dumb about roles. There is no `pisub agents/` registry, no frontmatter parser, no discovery layer. **A profile is just an executable shell script that calls `pisub spawn` with the right flags.** Pure Unix.

## Layout

```
~/.pisub/
├── profiles/                          # your executable profile scripts
│   ├── rust-coder                     # executable: calls pisub spawn
│   ├── rust-coder.prompt.md           # the role (system prompt)
│   ├── mk-expert
│   ├── mk-expert.prompt.md
│   └── ...
├── agents/<name>.log                 # pisub-owned: per-agent event logs
└── registry.json                     # pisub-owned: live agents
```

## Enable

One line in `~/.bashrc`:

```bash
export PATH="$HOME/.pisub/profiles:$PATH"
```

Then `rust-coder`, `mk-expert`, etc. are ordinary commands with tab-completion, `which`, and `--help` if you add it.

## Anatomy of a profile

`~/.pisub/profiles/rust-coder` (executable):

```sh
#!/bin/sh
# rust-coder — Rust developer sub-agent. Usage: rust-coder <name> [pisub flags...]
exec pisub spawn "$@" \
  --model <provider>/<model> \
  --tools read,write,edit,bash \
  --system-prompt-file "$(dirname "$0")/rust-coder.prompt.md"
```

`~/.pisub/profiles/rust-coder.prompt.md` (the role — whatever you'd put in a tintinweb agent body):

```markdown
You are a pragmatic Rust developer. You write production-quality Rust code.

## Style
- Minimal and idiomatic — no unnecessary abstractions
- anyhow::Result for errors, serde for JSON
- cargo check frequently
```

## Usage

```bash
rust-coder rc1                          # spawn named 'rc1' in current dir
rust-coder rc1 --cwd ~/dev/foo          # work in a specific project
rust-coder rc1 --tmux                   # wrap in tmux for live attach
rust-coder rc1 --model <provider>/<model>   # upgrade for hard task
rust-coder rc1 & rust-coder rc2 &       # two parallel workers
```

Flags passed after `<name>` override the profile's defaults (they come later in the arg list, and pi/pisub use last-wins for the same flag).

## Writing your own profile

1. Write the role as `~/.pisub/profiles/<name>.prompt.md`
2. Write `~/.pisub/profiles/<name>` as a 4-line shell script (copy rust-coder, change model + prompt-file)
3. `chmod +x ~/.pisub/profiles/<name>`
4. Done. No registry, no restart, no config.

Profiles compose like any Unix tool: source one from another for a shared base, add conditionals, read env vars. They're just shell scripts.