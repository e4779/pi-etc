import { createHash } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionEvent } from "@earendil-works/pi-coding-agent";

/**
 * context-guard — auto-project oversized fabric_exec results out of the model
 * context window (the "context saving" pillar of context-mode, as a
 * pi extension over pi-fabric instead of a fork).
 *
 * On every fabric_exec tool_result whose text exceeds the threshold:
 *   1. the full text is stored content-addressed at
 *      ~/.pi/agent/cache/pi-context-guard/<sha16>.txt (identical results
 *      deduplicate for free),
 *   2. the model sees a compact digest: marker, byte count, structural shape
 *      (parsed back from the rendered JSON when possible) and the storage path,
 *   3. retrieval uses the EXISTING pi.read tool (bounded offset/limit for
 *      slices) — zero new tools in the roster, zero coupling to fabric state.
 *
 * details/audits are left untouched, so the TUI keeps rendering the full
 * result. failures are silent: any error passes the original result through.
 *
 * Config: PI_CONTEXT_GUARD_BYTES env (default 8192, 0 disables).
 */

type ToolResultEvent = Extract<ExtensionEvent, { type: "tool_result" }>;
interface ContentBlock {
  type: string;
  text?: string;
}

const TOOL_NAME = "fabric_exec";
const DEFAULT_THRESHOLD_BYTES = 8192;
const MAX_CACHE_FILES = 200;
const PREVIEW_CHARS = 300;
const MARKER = '"__projected":true';

const CACHE_DIR = path.join(os.homedir(), ".pi", "agent", "cache", "pi-context-guard");

const thresholdBytes = (): number => {
  const raw = process.env.PI_CONTEXT_GUARD_BYTES;
  if (raw === undefined || raw === "") return DEFAULT_THRESHOLD_BYTES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_THRESHOLD_BYTES;
};

const preview = (value: unknown): string => {
  try {
    const json = JSON.stringify(value) ?? String(value);
    return json.length > PREVIEW_CHARS ? `${json.slice(0, PREVIEW_CHARS)}…` : json;
  } catch {
    return String(value).slice(0, PREVIEW_CHARS);
  }
};

const shapeOf = (text: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "string") {
      return { type: "string", length: value.length, first: value.slice(0, PREVIEW_CHARS) };
    }
    if (Array.isArray(value)) {
      return { type: "array", length: value.length, first: preview(value[0]) };
    }
    if (value !== null && typeof value === "object") {
      const keys = Object.keys(value as Record<string, unknown>);
      const record = value as Record<string, unknown>;
      return {
        type: "object",
        keyCount: keys.length,
        keys: keys.slice(0, 20),
        first: keys.length > 0 ? preview(record[keys[0]!]) : undefined,
      };
    }
    return { type: typeof value };
  } catch {
    return { type: "text", length: text.length, first: text.slice(0, PREVIEW_CHARS) };
  }
};

const gcCache = async (): Promise<void> => {
  const names = await readdir(CACHE_DIR);
  if (names.length <= MAX_CACHE_FILES) return;
  const dated = await Promise.all(
    names.map(async (name) => ({
      name,
      mtimeMs: (await stat(path.join(CACHE_DIR, name))).mtimeMs,
    })),
  );
  dated.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const entry of dated.slice(0, dated.length - MAX_CACHE_FILES)) {
    await unlink(path.join(CACHE_DIR, entry.name)).catch(() => {});
  }
};

const storeFull = async (text: string, key: string): Promise<string> => {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${key}.txt`);
  try {
    await stat(file);
  } catch {
    await writeFile(file, text, "utf8");
  }
  await gcCache().catch(() => {});
  return file;
};

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event: ToolResultEvent) => {
    try {
      if (event.toolName !== TOOL_NAME || event.isError) return undefined;
      const threshold = thresholdBytes();
      if (threshold <= 0) return undefined;

      const blocks: ContentBlock[] = Array.isArray(event.content)
        ? (event.content as ContentBlock[])
        : [];
      const text = blocks
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text as string)
        .join("\n\n");
      if (!text || text.length <= threshold || text.includes(MARKER)) return undefined;

      const key = createHash("sha256").update(text).digest("hex").slice(0, 16);
      const file = await storeFull(text, key);
      const digest = [
        `[context-guard] Return value auto-projected (${text.length} bytes > ${threshold}). Full value stored at: ${file}`,
        JSON.stringify({ __projected: true, bytes: text.length, shape: shapeOf(text) }),
        "Retrieve with pi.read (offset/limit for slices). Content-addressed: identical results reuse the same file.",
      ].join("\n");

      const others = blocks.filter((block) => block.type !== "text");
      return {
        content: [...others, { type: "text", text: digest } as ContentBlock],
      };
    } catch {
      return undefined; // never break the tool pipeline
    }
  });
}
