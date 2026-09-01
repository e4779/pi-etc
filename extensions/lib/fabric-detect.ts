/**
 * Shared Fabric full-code detection for pi-etc extensions.
 *
 * True when the pi-fabric package is installed (settings.json packages) and
 * its effective config does not disable fullCodeMode. Mirrors Fabric's own
 * precedence: <project>/.pi/fabric.json overrides ~/.pi/agent/fabric.json;
 * fullCodeMode defaults to true.
 *
 * Results are cached per cwd for the process lifetime.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const cache = new Map<string, boolean>();

export function isFabricFullCode(cwd: string): boolean {
  const cached = cache.get(cwd);
  if (cached !== undefined) return cached;

  let fullCode = false;
  try {
    const settings = JSON.parse(
      readFileSync(join(homedir(), ".pi", "agent", "settings.json"), "utf8"),
    ) as { packages?: unknown };
    const packages = (settings.packages ?? []) as unknown[];
    const hasFabric = packages.some(
      (p) => typeof p === "string" && p.includes("pi-fabric"),
    );
    if (hasFabric) {
      const readCfg = (p: string): Record<string, unknown> | undefined =>
        existsSync(p)
          ? (JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>)
          : undefined;
      const eff =
        readCfg(join(cwd, ".pi", "fabric.json")) ??
        readCfg(join(homedir(), ".pi", "agent", "fabric.json"));
      fullCode = eff?.["fullCodeMode"] !== false; // default true
    }
  } catch {
    fullCode = false;
  }

  cache.set(cwd, fullCode);
  return fullCode;
}
