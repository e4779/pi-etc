/**
 * co-author extension — auto-appends `Co-authored-by:` trailer to git commits.
 *
 * Intercepts `git commit` bash tool calls and appends
 *   --trailer "Co-authored-by: <Name> <model@work-hub.example>"
 * based on the current model.id. Identity is resolved from
 * ~/.pi/agent/coauthors.json (model.id → { name, email }), with a
 * fallback derived from the model.id itself.
 *
 * Only touches `git commit` (not `git commit --amend` of an existing
 * commit that already has the trailer — we skip if a --trailer is
 * already present). Does not run when no identity can be resolved.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface CoauthorEntry {
  name: string;
  email: string;
}

type CoauthorMap = Record<string, CoauthorEntry>;

const CONFIG_PATH = join(homedir(), ".pi", "agent", "coauthors.json");

/** Default fallback domain for derived identities. */
const FALLBACK_DOMAIN = "ai.local";

/** Load the model→identity map from config. Returns empty map on any error. */
function loadCoauthors(): CoauthorMap {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as CoauthorMap;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // missing file / invalid JSON — fall back to derivation only
  }
  return {};
}

/**
 * Derive a { name, email } from a model.id when no explicit mapping exists.
 * "zai-org/GLM-5.2" → { name: "GLM-5.2", email: "model@ai.local" }
 * "Qwen/Qwen3.6-27B" → { name: "Qwen3.6-27B", email: "qwen3.6-27b@ai.local" }
 */
function deriveIdentity(modelId: string): CoauthorEntry | null {
  if (!modelId) return null;
  // Take the last path segment, after any '/'
  const base = modelId.split("/").pop() ?? modelId;
  if (!base) return null;
  const slug = base.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return null;
  return { name: base, email: `${slug}@${FALLBACK_DOMAIN}` };
}

/** Resolve identity for a model: explicit map first, then derivation. */
function resolveIdentity(modelId: string, map: CoauthorMap): CoauthorEntry | null {
  if (map[modelId]) return map[modelId];
  return deriveIdentity(modelId);
}

/**
 * Is this a `git commit` invocation that we should augment?
 * Must contain `git commit` (possibly via `git -c ... commit`), must NOT
 * already carry a --trailer flag, and must NOT be a dry-run / --help.
 */
function shouldAugment(command: string): boolean {
  // quick rejects
  if (!/\bgit\b/.test(command)) return false;
  if (!/\bcommit\b/.test(command)) return false;
  // `--` starts with non-word chars, so \b doesn't anchor before them.
  // Use plain substring checks instead.
  if (command.includes("--trailer")) return false;
  if (command.includes("--help")) return false;
  if (command.includes("--dry-run")) return false;
  // find `git commit` (allow flags between git and commit, e.g. `git -c x=y commit`)
  // We look for `git` ... `commit` with only short flag-ish tokens in between.
  const gitCommitRe = /\bgit\b(?:\s+(?:-[A-Za-z]+|\S+=\S+|\S+))*\s+commit\b/;
  return gitCommitRe.test(command);
}

/**
 * Append the trailer flag to a git commit command. We insert it right
 * after the `commit` token to keep it adjacent to the subcommand, which
 * is safe regardless of trailing `-m "..."` / paths / `--amend`.
 */
function appendTrailer(command: string, identity: CoauthorEntry): string {
  const trailer = `--trailer "Co-authored-by: ${identity.name} <${identity.email}>"`;
  // Insert after the first `commit` word boundary.
  return command.replace(/\bcommit\b/, `commit ${trailer}`);
}

export default function (pi: ExtensionAPI) {
  // Cache the config per session (file is small, read once).
  let coauthors: CoauthorMap | null = null;

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;
    if (typeof command !== "string" || !command) return;
    if (!shouldAugment(command)) return;

    // Lazy-load config on first relevant call.
    if (coauthors === null) coauthors = loadCoauthors();

    // ctx.model is available on tool_call (see extensions.md → ctx.model).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelId = (ctx as any).model?.id ?? "";
    const identity = resolveIdentity(modelId, coauthors);
    if (!identity) return;

    event.input.command = appendTrailer(command, identity);
  });
}
