---
name: bun-runtime
description: "Working in the Fabric bun-process guest (Bun 1.4): in-guest Bun APIs vs pi.bash decision ladder, Bun Shell ($), scrubbed globals, the setTimeout crash rule, fetch with proxy option, sqlite/TOML/YAML/Glob/semver, and before/after patterns from session archaeology. Load when writing fabric_exec TypeScript that runs commands or processes files/data, when choosing between pi.bash and in-guest code, or before using timers/network in the guest."
---

# bun-runtime — ninja guide for the bun-process guest

> Evidence: 2026-09-21 — archaeology over 368 pi sessions (memory provider) + live probes
> against this guest (Bun 1.4.0). Claims marked *(docs)* come from official docs, everything
> else was executed in the guest.

## Mental model

`fabric_exec` = one Bun 1.4 process running your TypeScript. Host calls (`pi.*`, `mcp.*`)
are the expensive currency — round trips. In-guest work (fs, subprocesses, parsing,
filtering, aggregation) is nearly free. Compose: gather → process → filter → return compact.
The old rule «pi.bash — запускать программы, не писать shell-программы» now generalizes:
even program-running happens in-guest when it serves the dataflow.

## THE crash rule — read first

`setTimeout`, `setInterval`, and timer-based `Promise.race` **crash the executor**:
process exits 1, no result, «Process executor exited before returning a result».
Verified: a race + timer pair crashes with zero network involved; the same code without
timers succeeds.

Timeouts come from native mechanisms only:

- command flags: `curl --max-time 8`, real `timeout 30 <cmd>` binary;
- `bun.spawn(['sleep', '5'], { timeout: 400 })` → rc=143 (SIGTERM) after ~414ms — works;
- outer bounds: `fabric_exec` `timeoutMs`; `pi.bash` `timeout` parameter.

## Scrubbed globals — the import ladder

globalThis in the guest exposes almost nothing: `console` and `setTimeout` (which
crashes!) — that's it among platform globals. Scrubbed (verified): `Bun`, `fetch`,
`process`, `AbortSignal`, `Response`, `Blob`, `URL`, `TextEncoder`, `ReadableStream`,
`crypto`, `performance`, `Buffer`. Take everything from modules; bypass the static
typechecker with string-typed specifiers:

```ts
const bun: any = await import('bun' as string);       // full Bun API namespace
const $ = bun.$;
const fs: any = await import('node:fs' as string);    // Node compat works
const { Database } = await import('bun:sqlite' as string);
const yaml: any = await import('yaml' as string);     // npm auto-install works
```

## Decision ladder

1. **Pure Bun/TS** — file I/O (`bun.file`/`bun.write`), `Glob`, parsers, `sqlite`, JS data
   processing. No subprocess at all. Default.
2. **Bun Shell `$`** — real CLI binaries (rg, fd, git, cargo, npm) when you need them,
   batched and parallel inside the same program.
3. **pi.bash** — escape hatch: guest misbehaves, or you want strict fail-fast
   (nonzero exit → rejection, `settle: true` for error-as-value) without handling code.
   Not the default anymore.
4. **`extensions.box_exec`** — distrobox containers (see box skill; git stays on host).
5. **py-venv** (`~/.pi/agent/py-venv/bin/python` via `$` or pi.bash) — numpy/pandas only.

## Bun Shell `$` essentials

```ts
const bun: any = await import('bun' as string);
const $ = bun.$;
const t: string = await $`rg -n TODO src/`.quiet().text();   // capture stdout
const r: any = await $`false`.nothrow().quiet();             // no throw → r.exitCode
try { await $`exit 7` } catch (e: any) { e.exitCode /* 7 */ } // ShellError
for await (const l of $`git log --oneline -50`.quiet().lines()) { /* async iterator */ }
await $`sort < ${bun.file('/tmp/x.txt')}`.quiet().text();    // JS object as stdin
await $`ls`.env({ FOO: 'bar' }).cwd('/tmp').quiet().text();  // per-call env/cwd
await Promise.all([$`cmdA`.quiet(), $`cmdB`.quiet()]);       // parallel
```

- Interpolation is auto-escaped: `` $`echo ${'x; rm -rf /'}` `` prints the literal
  (verified). Never hand-build command strings.
- `.quiet()` before reading; without it output leaks to the activity log.
- `.nothrow()` → `{exitCode}` instead of throwing. Use for probes: `rg` with no matches
  exits 1, and a throwing probe kills your program.
- ShellPromise surface (verified): `cwd, env, quiet, nothrow, throws, text, json, lines,
  arrayBuffer, bytes, blob, run, then`. **No `timeout`/`kill` methods.**
- `$.defaults` **does not exist** in Bun 1.4 — configure per call.
- `.lines()` returns an async iterator — `for await`, not `.length`.
- Bash-like: pipes, `>` `>>` `2>` `&>` `2>&1`, `$()` substitution, `**`/`{a,b}` globs.
  Common commands (ls, cat, rm, mkdir, which…) have cross-platform builtins; real
  binaries win on Linux. No `/bin/sh` — parsed and run in-process, ops run concurrently *(docs)*.
- Interpolation protects against command injection, NOT argument injection *(docs)* —
  a binary may still read a value as one of its own flags.

## The `bun` namespace arsenal

| Need | API |
|---|---|
| Files | `bun.file(p).text()/.json()/.bytes()`, `bun.write(dest, data)` → bytes written (both verified) |
| Find files | `new bun.Glob('**/*.ts').scanSync({ cwd, onlyFiles: true })`, async `scan()` *(docs)* |
| SQLite | `import('bun:sqlite')` → `new Database(':memory:')`, `.run()`, `.query().get()` (verified) |
| Config/data | native `import('/path/f.toml')` → parsed object (verified); namespaces `bun.TOML`, `YAML`, `JSON5`, `JSONC`, `JSONL`, `XML` present |
| Versions | `bun.semver.satisfies('1.3.0', '^1.2.0')`, `.order(a, b)` (verified) |
| Hash | `new bun.CryptoHasher('sha256').update(s).digest('hex')` (verified), `bun.hash` |
| Binaries | `bun.which('rg')` → absolute path (verified) |
| Processes | `bun.spawn` / `bun.spawnSync` — streams, `{ timeout, killSignal }`, `exited` promise (verified) |
| Network | `bun.fetch` — see below |
| Env | `bun.env` (carries `PI_WEB_*`, full PATH, HOME — verified) |
| Namespace-only | `inspect`, `escapeHTML`, `stringWidth/stripANSI/wrapAnsi`, `gzipSync/zstd*`, `deepEquals/deepMatch`, `readableStreamToText()`, `Transpiler.scanImports`, `password`, `postgres`, `redis`, `S3Client`, `serve`, `FFI`, `mmap` |

## Network and the proxy rule

`bun.fetch` works (verified HTTP 200 to foreign hosts). Per-call proxy — verified through
the DPI bypass (different exit IP than direct):

```ts
await bun.fetch('https://blocked.example/', { proxy: 'http://<proxy-host>:8888' } as any);
```

House rules stay: foreign direct first, on hang/failure retry via proxy `<proxy-host>:8888`,
**never** route Russian domains through the proxy. Exit-IP check in-guest:
`bun.fetch('https://api.ipify.org/')`. npm registry — always npm CLI
(`npm view ${pkg} …` via `$`), never raw fetch (bot-gaslighting 404s).

## Patterns from our archaeology (1547 pi.bash calls, 30 sampled)

| Observed habit | bun-ninja replacement |
|---|---|
| `for p in …; do npm view …; done` (loops in 8/30) | ``await Promise.all(pkgs.map(p => $`npm view ${p} version`.quiet().text()))`` |
| survey chains: `ls; echo ---; cat …` (pipes in 24/30) | one program: `Glob.scanSync` + `bun.file().text()` → single compact report |
| `cat X` into `head -50` | `const s = await bun.file(p).text()` → slice/filter in JS |
| `rg` piped into `head`, raw dump | `.quiet().lines()` → JS filter + `.slice(0, N)` before return |
| `$(fd -e parquet …)` subshell counting | `[...new bun.Glob('*.parquet').scanSync({ cwd })].length` |
| `cd X && git log --oneline -25` | `$`git -C ${dir} log --oneline -25`.quiet().text()` or `.cwd(dir)` |
| `2>/dev/null` hiding errors (190 failed ops on record) | `.nothrow().quiet()` → inspect `exitCode`/`stderr` explicitly |
| one pi.bash round trip per step | batch the whole workflow into one `fabric_exec` |

## Bounds

- Whole program: `fabric_exec` `timeoutMs`. Known-long suites: one call, explicit timeout.
- Per command: native flags (`--max-time`, `timeout N`) or `bun.spawn({ timeout })`.
  **Never JS timers.**
- Big outputs never returned raw: aggregate in-guest, return decisions + evidence.
