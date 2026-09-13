---
name: box
description: >
  Distrobox integration for pi (extensions.box_list / extensions.box_exec
  inside fabric_exec; same tools without the prefix when fabric is off).
  Conventions for host vs box: install packages ONLY inside a box, git
  always on the host, builds/tests/experiments inside the box. Default box:
  playground (debian:13). Boxes are created manually — the tools never
  create or remove them.
---

# box — distrobox integration

Two custom tools bridge pi to distrobox so experimental work happens in
disposable containers, not on the host.

## Tools

```ts
extensions.box_list()                          // → { name, image, status }[]
extensions.box_exec({ box, cmd, timeoutSec? }) // → details { ok, exitCode, output, timedOut }
```

(In plain pi without fabric the same tools are called without the
`extensions.` prefix.)

- `extensions.box_exec` runs `distrobox enter <box> -- bash -lc <cmd>`;
timeout defaults to 120s, max 3600s.
- No `create`/`rm` tool **by design**: box lifecycle is a human decision.
Ask the user instead of mutating the box fleet yourself.

## Host vs box conventions (the contract)

| Concern | Where | Why |
|---|---|---|
| Package installs (`apt`, `pip`, global `npm`) | **box only** | host stays clean; host packages are minimal by policy |
| git (clone / commit / branch / push) | **host** | repo is the source of truth; boxes see it via mounted `$HOME` |
| Builds, tests, coverage, experiments | **box** | crashes, stray files, stale artifacts stay disposable |
| Test daemons/servers | **box** | port conflicts and leftovers never touch the host |

Rules:

1. **Never install host packages from an agent.** `sudo apt install` on the
host is off-limits; if a tool is missing, run the command in a box.
2. **Repos stay on the host filesystem.** distrobox mounts `$HOME`, so the
exec tool can read and write repo files directly — but commits and branch
operations happen on the host.
3. **Default box: `playground`** (debian:13). Create it manually, once:

```sh
distrobox create -n playground -i debian:13
```

4. **First entry into a fresh box runs its setup** and can take minutes —
pass a larger `timeoutSec` on the first call after creation.
5. **Long jobs**: either raise `timeoutSec` (max 3600) or start the job in
the background inside the box (`nohup ... &`) and poll it. A timed-out call
SIGKILLs the local distrobox/podman client; the command itself may keep
running inside the box — check with
`extensions.box_exec({ box, cmd: 'pgrep -af <name>' })`.

## Manual verification (when no box exists yet)

1. `distrobox list` — see what is there (or call `extensions.box_list`).
2. `distrobox create -n playground -i debian:13`
3. `extensions.box_list()` → `playground` appears with status `Created`.
4. `extensions.box_exec({ box: 'playground', cmd: 'echo ok' })` →
`ok: true`, output contains `ok`.
5. `extensions.box_exec({ box: 'playground', cmd: 'head -2 /etc/os-release' })`
→ shows Debian 13.

## Host facts (labhost)

- distrobox 1.8.1.2, podman 5.4.2 (docker.io images are pulled via podman).
- Current boxes: check live with `extensions.box_list()` /
`distrobox list` — do not assume any specific box exists.
