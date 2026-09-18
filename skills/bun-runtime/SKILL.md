---
name: bun-runtime
description: "Bun-first rules for the fabric_exec bun-process guest: import ladder past scrubbed globals, decision ladder (Bun/Bun Shell vs pi.* escape hatches), timer rules, bounds. Load when writing fabric_exec TypeScript that runs commands or processes files/data; when bun.$ returns empty output or 0 lines; when a guest program fails typecheck; when raw output must be filtered before it hits context; when choosing pi.bash vs in-guest shell. Triggers: пустой вывод, exitCode, typecheck-отказ, glob не разворачивается, фильтрация вывода."
---

# bun-runtime — Bun-first in the fabric_exec guest

`fabric_exec` = one Bun process running your TypeScript. Host calls (`pi.*`) cost round
trips; in-guest work (fs, subprocesses, parsing, filtering, aggregation) is nearly free.
Compose one program: gather → process → filter → return compact. **Bun is the default;
`pi.*` host calls are typed escape hatches, not defaults.**

## `__bun` is prebound — do NOT write the import ladder
The bun-process runtime of our fork (@e4779/pi-fabric, upstream PR #154) binds the Bun
module namespace as a `__bun` sandbox global. Use it directly:

```ts
const stat = await __bun.file('/tmp/x.json').json();       // file I/O
const rows = [...new __bun.Glob('**/*.ts').scanSync({ cwd: 'src' })];
const t = await __bun.$`rg -n TODO src/`.quiet().text();   // shell
```

`node:fs` / `node:os` / `bun:sqlite` and friends still come via string-typed imports:
const fs: any = await import('node:fs' as string); const { Database } = await import('bun:sqlite' as string);

Fallback (vanilla runtime, `typeof __bun === 'undefined'`): `const bun: any = await import('bun' as string)`
and keep the examples below in terms of `bun.*`. On vanilla upstream runtimes even that
import fails (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING) — `__bun` is the only path there.
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
