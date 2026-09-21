---
name: bun-runtime
description: "In-guest data work for the fabric_exec bun-process guest: when to aggregate/filter data in TS instead of shelling out; __bun prebound namespace; Bun Shell traps vs bash. Load when aggregating many files or reducing large structured output in fabric_exec; when bun.$ returns empty output or exits 1; when 'Cannot find name Bun/process/fetch' typecheck fails; when a glob or interpolation misbehaves in Bun Shell. Triggers: агрегация, фильтрация, пустой вывод, exitCode, typecheck-отказ, glob не разворачивается."
---

# bun-runtime — in-guest data work (tool, not doctrine)

Defaults are `pi.bash`/`pi.read` — typed host calls models already know. Reach for
in-guest TS only when DATA is the subject: aggregating many files, filtering/reducing
structured output, building tables in one round trip. Compose: gather → process →
return a compact digest (<8KB; bigger → write a file, return the path).

## `__bun` is prebound (`Bun`/`process`/`fetch`/`Buffer` are scrubbed)
```ts
const files = [...new __bun.Glob('**/*.jsonl').scanSync({ cwd: dir })]; // array → args
const raw  = await __bun.file('/tmp/dump.txt').text();                  // raw read, no hashes
const out  = await __bun.$`rg -c err ${dir}`.quiet().nothrow().text();  // probe pattern
```

## Recipe — corpus aggregate in one call
```ts
const counts: Record<string, number> = {};
for (const f of files) {
  const t = await __bun.file(`${dir}/${f}`).text();
  counts[f] = t.split('\n').filter(l => l.includes('"role":"user"')).length;
}
return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
```

## Bun Shell ≠ bash — traps
- A string with spaces interpolates as ONE argument — pass a TS array for arg lists.
- No `2>`/`2>&1` stderr redirects — use `.quiet()` + `.nothrow()`, read `.text()`.
- Tilde does not expand inside interpolated values — absolute paths only.
- Globs are literal in shell strings — use `new __bun.Glob(...).scanSync()`.
- `rg` exit 1 = no match: always `.nothrow().quiet()` on probes, else the throw kills the program.

Deep dive: `REFERENCE.md` next to this file.
