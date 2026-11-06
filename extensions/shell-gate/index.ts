/**
 * shell-gate — pre-execution shell hygiene gate for agent shell commands
 * and shell scripts.
 *
 * Goal: stop the agent from writing sloppy shell on the fly and then
 * debugging it character by character. Blocked calls return structured
 * diagnostics as the block reason, so the fix loop is one turn: the model
 * sees the SC codes and rewrites immediately.
 *
 * Layers (fail-open everywhere — a broken gate never wedges the agent):
 *   1. bash --norc -n parse check. Always available; catches unbalanced
 *      quotes, broken heredocs, parse errors ("unexpected EOF" class).
 *   2. ShellCheck semantics via shellcheck-wasm (an npm dependency of
 *      pi-etc, executed by the bun runtime pi already uses). No host
 *      binary needed — FreeBSD pkg does not ship shellcheck. Catches
 *      word splitting, unquoted variables, rm -rf on empty variables.
 *
 * Blocked calls return { block: true, reason }. Escape hatch: prepend a
 * "# shellcheck disable=SCxxxx" directive line (a plain bash comment,
 * respected by ShellCheck) to confirm an intentional pattern. User "!"-bash
 * is a different event (user_bash) and is never gated.
 *
 * Config: ~/.pi/agent/shell-gate.json (or PI_SHELL_GATE_CONFIG env):
 *   {
 *     "enabled": true,
 *     "syntaxCheck": true,       // bash -n layer
 *     "shellcheck": true,        // ShellCheck layer, skipped if unavailable
 *     "minSeverity": "info",     // info+ keeps the quote/word-split class
 *     "maxIssues": 6,
 *     "skipTrivial": true,       // no shellcheck on metachar-free commands
 *     "scriptSuffixes": [".sh"],
 *     "minWriteLines": 3,
 *     "suppressedCodes": ["SC1090", "SC1091", "SC2148"]
 *   }
 * Kill switch: PI_SHELL_GATE=off
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { LintOptions, LintResult } from "shellcheck-wasm";

interface Issue {
  severity: string;
  line: number;
  col: number;
  message: string;
  code: string;
}

interface ShellGateConfig {
  enabled?: boolean;
  syntaxCheck?: boolean;
  shellcheck?: boolean;
  minSeverity?: string;
  maxIssues?: number;
  skipTrivial?: boolean;
  scriptSuffixes?: string[];
  minWriteLines?: number;
  suppressedCodes?: string[];
  commandSuppressedCodes?: string[];
}

type WasmInstance = {
  lintWithOptions(script: string, options: LintOptions): Promise<LintResult[]>;
};

const DEFAULT_SUPPRESSED = ["SC1090", "SC1091", "SC2148"];
const DEFAULT_CMD_SUPPRESSED = ["SC2154"];
const SEVERITY_RANK: Record<string, number> = { style: 0, info: 1, warning: 2, error: 3 };
const SHELL_METACHARS = /[$\"\\`|&;<>()\n]/;

function tryReadJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function loadConfig(file?: string): ShellGateConfig {
  const path = file ?? process.env.PI_SHELL_GATE_CONFIG ?? join(homedir(), ".pi", "agent", "shell-gate.json");
  const raw = tryReadJson(path);
  return { ...(raw ?? {}) } as ShellGateConfig;
}

export function isTrivial(cmd: string): boolean {
  return !SHELL_METACHARS.test(cmd);
}

/** Shell dialect from a shebang line, defaulting to bash (pi executes via bash). */
export function detectDialect(script: string): string {
  const first = script.split("\n", 1)[0] ?? "";
  if (!first.startsWith("#!")) return "bash";
  if (first.endsWith("bash")) return "bash";
  if (first.endsWith("dash")) return "dash";
  if (first.endsWith("ksh")) return "ksh";
  if (first.endsWith("sh")) return "sh";
  return "bash";
}

function bashParseError(cmd: string): string | null {
  let r: ReturnType<typeof spawnSync>;
  try {
    r = spawnSync("bash", ["--norc", "-n", "-c", cmd], { timeout: 5000, encoding: "utf8" });
  } catch {
    return null;
  }
  if (r.error) return null; // spawn-level failure: fail open
  if (r.status === 0) return null;
  const out = ((r.stderr ?? "") + "\n" + (r.stdout ?? "")).trim();
  return out.length > 0 ? out.slice(0, 600) : "bash refused to parse the command";
}

let wasmInit: Promise<WasmInstance> | null = null;
let wasmWarned = false;

function warnOnce(msg: string): void {
  if (!wasmWarned) {
    wasmWarned = true;
    console.error("[shell-gate] " + msg);
  }
}

async function getWasm(): Promise<WasmInstance | null> {
  if (!wasmInit) {
    try {
      const mod = await import("shellcheck-wasm");
      wasmInit = mod.createShellCheck();
    } catch {
      wasmInit = null;
    }
  }
  if (!wasmInit) {
    warnOnce("shellcheck-wasm unavailable — semantic layer skipped, parse layer stays active");
    return null;
  }
  try {
    return await wasmInit;
  } catch {
    wasmInit = null;
    warnOnce("shellcheck-wasm failed to initialise — semantic layer skipped");
    return null;
  }
}

function toIssues(results: LintResult[]): Issue[] {
  return results.map((r) => ({
    severity: r.severity,
    line: r.line,
    col: r.column,
    message: r.message,
    code: "SC" + String(r.code),
  }));
}

/** Returns issues, or null when the semantic layer is unavailable (fail-open). */
export async function shellCheckIssues(
  script: string,
  cfg: ShellGateConfig,
  opts?: { command?: boolean },
): Promise<Issue[] | null> {
  const inst = await getWasm();
  if (!inst) return null;
  const floor = SEVERITY_RANK[cfg.minSeverity ?? "info"] ?? SEVERITY_RANK.info;
  const base = cfg.suppressedCodes ?? DEFAULT_SUPPRESSED;
  const cmdExtra = opts?.command ? (cfg.commandSuppressedCodes ?? DEFAULT_CMD_SUPPRESSED) : [];
  const suppressed = new Set([...base, ...cmdExtra].map((c) => c.replace(/^SC/, "")));
  const options: LintOptions = {
    shell: detectDialect(script) as LintOptions["shell"],
    severity: (cfg.minSeverity as LintOptions["severity"]) ?? "info",
  };
  try {
    const results = await inst.lintWithOptions(script, options);
    return toIssues(results).filter(
      (i) => (SEVERITY_RANK[i.severity] ?? 0) >= floor && !suppressed.has(i.code.replace(/^SC/, "")),
    );
  } catch {
    warnOnce("shellcheck lint call failed — skipping this check");
    return null;
  }
}

export function formatReason(what: string, issues: Issue[], maxIssues: number): string {
  const shown = issues.slice(0, Math.max(1, maxIssues));
  const lines = shown.map(
    (i, n) => (n + 1) + ". " + i.code + " (" + i.severity + ") line " + i.line + ":" + i.col + " — " + i.message,
  );
  if (issues.length > shown.length) lines.push("(+" + (issues.length - shown.length) + " more — raise maxIssues to see all)");
  const head = `shell-gate: blocked ${what} — ${issues.length} shell issue(s). Fix and retry; if a warning is intentional, prepend "# shellcheck disable=SCxxxx" directive line(s) matching the codes above.\n`;
  return head + lines.join("\n");
}

export default function shellGate(pi: ExtensionAPI): void {
  const cfg = loadConfig();
  if (process.env.PI_SHELL_GATE === "off" || cfg.enabled === false) return;

  pi.on("tool_call", async (event) => {
    if (isToolCallEventType("bash", event)) {
      const cmd = event.input.command;
      if (typeof cmd !== "string" || cmd.trim().length === 0) return;
      if (cfg.syntaxCheck !== false) {
        const parseErr = bashParseError(cmd);
        if (parseErr) return { block: true, reason: "shell-gate: bash cannot parse this — fix before running:\n" + parseErr };
      }
      if (cfg.shellcheck === false) return;
      if ((cfg.skipTrivial ?? true) && isTrivial(cmd)) return;
      const issues = await shellCheckIssues(cmd, cfg, { command: true });
      if (issues && issues.length > 0) return { block: true, reason: formatReason("command", issues, cfg.maxIssues ?? 6) };
      return;
    }
    if (isToolCallEventType("write", event)) {
      const input = event.input as { path?: string; text?: string; content?: string };
      const path = input.path ?? "";
      const text = input.text ?? input.content ?? "";
      if (path.length === 0 || text.length === 0) return;
      const suffixes = cfg.scriptSuffixes ?? [".sh"];
      if (!suffixes.some((s) => path.endsWith(s))) return;
      if (text.split("\n").length < (cfg.minWriteLines ?? 3)) return;
      if (cfg.syntaxCheck !== false) {
        const parseErr = bashParseError(text);
        if (parseErr) return { block: true, reason: "shell-gate: " + path + " does not parse:\n" + parseErr };
      }
      if (cfg.shellcheck === false) return;
      const issues = await shellCheckIssues(text, cfg);
      if (issues && issues.length > 0) return { block: true, reason: "shell-gate: " + path + "\n" + formatReason("script", issues, cfg.maxIssues ?? 6) };
    }
  });
}