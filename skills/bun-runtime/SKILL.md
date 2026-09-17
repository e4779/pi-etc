---
name: bun-runtime
description: "Bun-first rules for the fabric_exec bun-process guest: import ladder past scrubbed globals, decision ladder (Bun/Bun Shell vs pi.* escape hatches), timer rules, bounds. Load when writing fabric_exec TypeScript that runs commands or processes files/data."
---

# bun-runtime — Bun-first in the fabric_exec guest

`fabric_exec` = one Bun process running your TypeScript. Host calls (`pi.*`) cost round
trips; in-guest work (fs, subprocesses, parsing, filtering, aggregation) is nearly free.
Compose one program: gather → process → filter → return compact. **Bun is the default;
`pi.*` host calls are typed escape hatches, not defaults.**

## Import ladder (globals are scrubbed)
`globalThis` in the guest exposes almost nothing. Take APIs from modules; string-typed
specifiers bypass the static typechecker:

```ts
const bun: any = await import('bun' as string);      // Bun namespace: file, Glob, $, sqlite...
const $ = bun.$;
const fs: any = await import('node:fs' as string);   // Node compat works
const { Database } = await import('bun:sqlite' as string);
```

## Timer rules
`setTimeout`/`setInterval` are intercepted by the host (`fabric.$timer` in
`node-process-runtime.ts`, commit 738f721 / upstream PR monotykamary/pi-fabric#153) and
resolve natively — they no longer crash the executor. Prefer native timeout mechanisms
where simpler: command flags (`curl --max-time 8`), `timeout N <cmd>`,
`bun.spawn([...], { timeout })`, or the outer `fabric_exec` `timeoutMs`. JS timers work
but add a host round-trip per tick; for waits, `await bun.$`sleep N`.quiet()` or
`pi.bash({cmd:'sleep N'})` avoid the round-trip.

## Decision ladder
1. **Pure Bun/TS (default)** — `bun.file(p).text()/.json()`, `bun.write(p, data)`,
   `new bun.Glob('**/*.ts').scanSync({ cwd, onlyFiles: true })`, `bun:sqlite`, native
   TOML/YAML imports, `bun.semver`, `CryptoHasher`. No subprocess at all.
2. **Bun Shell `$`** — real binaries (rg, fd, git, cargo, npm), batched and parallel in
   the same program: `$`rg -n \${pat} \${dir}`.quiet().text()``.
   `.nothrow().quiet()` for probes (`rg` exits 1 on no match and a throw kills the
   program); `.lines()` is an async iterator; interpolation is auto-escaped; always
   `.quiet()` before reading.
3. **pi.bash — escape hatch only**: strict fail-fast (nonzero exit → rejection;
   `settle: true` for error-as-value), host env/approvals, or guest misbehavior.
4. `extensions.box_exec` for distrobox containers; py-venv via `$` for numpy/pandas only.

## Bounds & hygiene
- One `fabric_exec` per workflow; `timeoutMs` as the outer bound. Aggregate in-guest;
  return decisions + evidence, never raw dumps.
- Network: `bun.fetch(url, { proxy } as any)` per-call proxy; house rules unchanged
  (proxy for foreign resources only, never RU domains). npm facts — npm CLI via `$`,
  never raw fetch (Cloudflare fake-404s).
- Full arsenal (bun namespace table, fetch/proxy recipes, archaeology patterns,
  ShellPromise surface): read `REFERENCE.md` next to this file.
