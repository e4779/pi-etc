import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * skill-gate — teach-first gate over fabric provider calls.
 *
 * The first call to a gated ref in a session does not execute: it returns the
 * skill document (SKILL.md) as the call result, so the model reads the gotchas
 * exactly when it was about to need them. Subsequent calls pass through to the
 * real provider. The served-set resets on session switch and compaction, so a
 * fresh context gets the skill re-served automatically (mechanically closes
 * the post-compaction bootstrap-loss failure mode of advisory skill systems).
 *
 * Transport: the pi-fabric provider-middleware discovery handshake, mirrored
 * here as a literal string event — zero runtime dependency on pi-fabric (same
 * trick as its bash-middleware symbol mirroring). Fabric emits the handshake
 * before any provider mounts, so decorated generations are the only ones the
 * registry ever sees.
 *
 * Fail-open: an unresolvable skill passes the call through (negative-cached).
 * Nothing is gated unless a pattern is configured.
 *
 * Config: ~/.pi/agent/skill-gate.json (or PI_SKILL_GATE_CONFIG):
 *   { "patterns": { "mcp.zai": "zai-mcp" }, "skillRoots": ["~/..."] }
 * Defaults gate the three MCP servers with known gotcha skills.
 */

const FABRIC_PROVIDER_MIDDLEWARE_DISCOVER_EVENT = "pi-fabric:provider-middleware:discover:v1";

/** Full-ref prefix -> skill directory name. Segment-boundary matched. */
const DEFAULT_PATTERNS: Record<string, string> = {
  "mcp.zai": "zai-mcp",
  "mcp.github": "github",
  "mcp.chrome": "chrome-devtools",
};

const DEFAULT_SKILL_ROOTS = [
  "/home/e4779/.pi/agent/git/gitverse.ru/e4779/pi-etc/skills",
  join(homedir(), ".pi", "agent", "skills"),
];

interface GateConfig {
  patterns: Record<string, string>;
  skillRoots: string[];
}

function loadConfig(): GateConfig {
  const cfg: GateConfig = { patterns: { ...DEFAULT_PATTERNS }, skillRoots: [...DEFAULT_SKILL_ROOTS] };
  const file = process.env.PI_SKILL_GATE_CONFIG ?? join(homedir(), ".pi", "agent", "skill-gate.json");
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<GateConfig>;
      if (raw.patterns && typeof raw.patterns === "object") cfg.patterns = { ...cfg.patterns, ...raw.patterns };
      if (Array.isArray(raw.skillRoots) && raw.skillRoots.length > 0) {
        cfg.skillRoots = raw.skillRoots.map((r) => r.replace(/^~/, homedir()));
      }
    }
  } catch {
    // bad config file -> built-in defaults
  }
  return cfg;
}

/** "mcp.zai" matches "mcp.zai_search.x" and "mcp.zai-search.x", not "mcp.zombie.x". */
function matchesRef(ref: string, key: string): boolean {
  if (!ref.startsWith(key)) return false;
  const next = ref[key.length];
  return next === undefined || next === "." || next === "-" || next === "_";
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function skillGateExtension(pi: ExtensionAPI): void {
  const cfg = loadConfig();
  const entries = Object.entries(cfg.patterns).filter(([, skill]) => Boolean(skill));
  const served = new Set<string>();
  const missing = new Set<string>();

  // The context that read the skill disappears on switch/compaction — clear the
  // served-set so the fresh context gets it re-served on the first gated call.
  const reset = (): void => {
    served.clear();
  };
  pi.on("session_before_switch", async () => reset());
  pi.on("session_before_compact", async () => reset());

  const readSkill = (skill: string): string | undefined => {
    for (const root of cfg.skillRoots) {
      const file = join(root, skill, "SKILL.md");
      if (existsSync(file)) {
        try {
          return readFileSync(file, "utf8");
        } catch {
          // unreadable -> try next root
        }
      }
    }
    return undefined;
  };

  const match = (ref: string): string | undefined => {
    for (const [key, skill] of entries) {
      if (matchesRef(ref, key)) return skill;
    }
    return undefined;
  };

  pi.events.on(FABRIC_PROVIDER_MIDDLEWARE_DISCOVER_EVENT, (payload: unknown) => {
    const mw = payload as { version?: number; add?: (wrap: unknown) => void } | null;
    if (mw?.version !== 1 || typeof mw.add !== "function") return;
    mw.add((inner: any) => {
      if (!inner || typeof inner.invoke !== "function") return inner;
      const wrapped: any = { ...inner };
      wrapped.invoke = async (actionName: string, args: any, context: any) => {
        const ref = `${String(inner.name)}.${String(actionName)}`;
        const skill = match(ref);
        if (!skill || served.has(skill)) return inner.invoke(actionName, args, context);
        const text = missing.has(skill) ? undefined : readSkill(skill);
        if (text === undefined) {
          missing.add(skill); // negative cache: stop stat-ing a missing skill
          return inner.invoke(actionName, args, context);
        }
        served.add(skill);
        return [
          `[skill-gate] First call to ${ref} in this session.`,
          `Serving the '${skill}' skill instead of executing — read it, then re-issue your call.`,
          "",
          text,
        ].join("\n");
      };
      return wrapped;
    });
  });
}