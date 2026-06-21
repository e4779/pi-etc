#!/usr/bin/env node
/**
 * pi-session — inspect pi agent session JSONL files.
 *
 * Resolves the pi agent SDK from the global installation at runtime.
 * No local node_modules needed — just `npx tsx pi-session.ts <args>`.
 *
 * Uses `rg` (ripgrep) for fast cross-session search when available.
 *
 * Usage:
 *   pi-session --list                  List all projects
 *   pi-session --list-sessions [PROJ]  List sessions with message counts
 *   pi-session --list-sessions -v      List sessions with file paths
 *   pi-session --find TEXT             Fuzzy-find by text (UUID, project)
 *   pi-session <file.jsonl>            Show summary (default)
 *   pi-session <file.jsonl> --summary  Message counts by role
 *   pi-session <file.jsonl> --last N   Last N messages
 *   pi-session <file.jsonl> --first N  First N messages
 *   pi-session <file.jsonl> --role ROLE  Filter by role
 *   pi-session <file.jsonl> --grep TEXT  Search in message text
 *   pi-session --grep-dir DIR TEXT       Search across all sessions in DIR
 */

import { execSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { basename } from "node:path";

// Resolve the globally installed pi agent SDK
function resolvePiSdk(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";

  // Try npm root -g first
  try {
    const globalRoot = execSync("npm root -g", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (globalRoot) {
      const p = `${globalRoot}/@earendil-works/pi-coding-agent/dist/index.js`;
      try { if (statSync(p).isFile()) return p; } catch { /* continue */ }
    }
  } catch { /* npm not available */ }

  // Fallback: common global paths
  const candidates = [
    `${home}/.nvm/versions/node/${process.versions.node}/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js`,
    `${home}/.nvm/current/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js`,
    `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js`,
    `/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js`,
  ];
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; } catch { continue; }
  }

  // Last resort: env var
  if (process.env.PI_SDK_PATH) {
    return `${process.env.PI_SDK_PATH}/dist/index.js`;
  }

  console.error("Cannot find @earendil-works/pi-coding-agent. Is pi installed?");
  console.error("Try: npm install -g @earendil-works/pi-coding-agent");
  console.error("Or set PI_SDK_PATH to the package root.");
  process.exit(1);
}

const sdkPath = resolvePiSdk();
const url = pathToFileURL(sdkPath).href;

// Dynamic import from the resolved global path
const sdk = (await import(url)) as typeof import("@earendil-works/pi-coding-agent");
const { SessionManager } = sdk;
import type { SessionEntry, SessionMessageEntry, SessionInfo } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(message: SessionMessageEntry["message"]): string {
  if (typeof message.content === "string") return message.content;
  if (!message.content || !Array.isArray(message.content)) return "";
  return message.content
    .filter(
      (c): c is { type: "text"; text: string } =>
        typeof c === "object" && c !== null && "type" in c &&
        c.type === "text" && "text" in c,
    )
    .map((c) => c.text)
    .join(" ");
}

function extractAllText(message: SessionMessageEntry["message"]): string {
  if (typeof message.content === "string") return message.content;
  if (!message.content || !Array.isArray(message.content)) return "";
  return message.content
    .filter((c): c is Record<string, unknown> =>
      typeof c === "object" && c !== null,
    )
    .map((c) => {
      if ("text" in c && c.text) return c.text as string;
      if ("thinking" in c && c.thinking) return c.thinking as string;
      return "";
    })
    .join("\n");
}

/** Collapse all whitespace to single spaces for fuzzy matching */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Case-insensitive, whitespace-normalized substring match */
function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  return normalizeWhitespace(text).toLowerCase().includes(normalizeWhitespace(query).toLowerCase());
}

function loadEntries(path: string): SessionEntry[] {
  // B1: Detect pisub logs by content and refuse BEFORE SessionManager.open()
  // pisub RPC event types — authoritative list
  const PISUB_EVENT_TYPES = new Set([
    "response", "agent_start", "agent_end", "turn_start", "turn_end",
    "message_start", "message_update", "message_end",
    "tool_execution_start", "tool_execution_update", "tool_execution_end",
    "queue_update", "compaction_start", "compaction_end",
    "auto_retry_start", "auto_retry_end", "extension_error"
  ]);

  // Read first non-empty line to detect pisub log format
  try {
    const firstLine = readFileSync(path, "utf-8").split("\n").find((l) => l.trim().length > 0);
    if (firstLine) {
      try {
        const obj = JSON.parse(firstLine);
        // Check for pisub log: has ts + type in the known event types
        if ("ts" in obj && "type" in obj && typeof obj.type === "string" && PISUB_EVENT_TYPES.has(obj.type)) {
          const name = basename(path).replace(/\.log$/, "");
          console.error(`pi-session: '${path}' is a pisub RPC event log, not a pi session.`);
          console.error(`  SessionManager.open() would TRUNCATE it — refusing.`);
          console.error(`  Inspect it with: pisub log ${name} | pisub report ${name} | pisub grep ${name} <text>`);
          console.error(`  (name = filename without .log)`);
          process.exit(2);
        }
      } catch {
        // Parse failed: not JSON, fall through to normal SessionManager.open
      }
    }
  } catch {
    // File read failed: let SessionManager.open handle the error
  }

  // B2: Backup-before-open (defense in depth)
  // B1 catches known pisub formats; this catches anything B1 missed (future
  // event types, malformed lines, other non-session files). We copy to .bak,
  // open, and if SessionManager rewrote the file, warn + keep .bak. If the
  // file is a valid pi session (unchanged), delete the temp .bak so we don't
  // litter ~/.pi/agent/sessions/ with backups on every invocation.
  let sizeBefore = 0;
  let madeBackup = false;
  try {
    copyFileSync(path, path + ".bak");
    sizeBefore = statSync(path).size;
    madeBackup = true;
  } catch {
    // File doesn't exist or can't read — SessionManager.open will fail with proper error
  }

  const sm = SessionManager.open(path);
  const entries = sm.getEntries();

  // Any size change means SessionManager rewrote a foreign file (could even
  // grow it, if the original was smaller than a session header).
  if (madeBackup) {
    try {
      const sizeAfter = statSync(path).size;
      if (sizeAfter !== sizeBefore) {
        console.error(`pi-session: WARNING — '${path}' changed from ${sizeBefore} to ${sizeAfter} bytes`);
        console.error(`  during SessionManager.open(). It was not a valid pi session. The original`);
        console.error(`  content was backed up to '${path}.bak'. This indicates a pisub log or`);
        console.error(`  other non-session file that the B1 detector missed — please report it`);
        console.error(`  so the detector can be extended.`);
        // keep .bak — user needs it
      } else {
        // Valid session, unchanged — remove the temporary backup
        try { rmSync(path + ".bak"); } catch { /* best effort */ }
      }
    } catch {
      // Stat failed, can't tell — keep .bak just in case
    }
  }

  return entries;
}

function isMessageEntry(e: SessionEntry): e is SessionMessageEntry {
  return e.type === "message";
}

// ---------------------------------------------------------------------------
// rg helpers — fast line-level search across JSONL files
// ---------------------------------------------------------------------------

/** Locate rg binary (pi installs it to ~/.pi/agent/bin/) */
function findRg(): string | null {
  const candidates = [
    process.env.PI_BIN_DIR
      ? `${process.env.PI_BIN_DIR}/rg`
      : null,
    `${process.env.HOME ?? "/"}/.pi/agent/bin/rg`,
    "rg", // rely on PATH
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      execSync(`command -v ${c}`, { stdio: ["ignore", "ignore", "ignore"] });
      return c;
    } catch { /* continue */ }
  }
  return null;
}

/**
 * Run rg on a single JSONL file. Returns matched lines as strings.
 * Uses spawnSync (no shell) to avoid injection.
 */
function rgMatchFile(rg: string, filePath: string, query: string): string[] {
  try {
    const result = spawnSync(rg, ["--fixed-strings", "-i", "--no-heading", query, filePath], {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    });
    if (result.error) return [];
    return result.stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** List all .jsonl files in a directory (non-recursive) */
function listJsonlFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(dir, f))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Fast grep across one or more JSONL files using rg.
 * Returns { role, text, file } for matched messages.
 */
function rgGrep(
  rg: string,
  files: string[],
  query: string,
  roleFilter?: string,
): { role: string; text: string; file: string }[] {
  const normalized = normalizeWhitespace(query);
  const results: { role: string; text: string; file: string }[] = [];

  for (const f of files) {
    const lines = rgMatchFile(rg, f, query);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type !== "message" || !obj.message?.role) continue;
        const role = obj.message.role;
        if (roleFilter && role !== roleFilter) continue;

        const text = extractRawText(obj.message);
        if (!text) continue;

        const matched = fuzzyMatch(text, normalized);
        if (!matched) continue;

        results.push({ role, text, file: f });
      } catch { /* skip unparseable lines */ }
    }
  }
  return results;
}

/** Extract text from a raw JSON message object (no SDK needed) */
function extractRawText(message: { content?: unknown }): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => {
      if (typeof c.text === "string") return c.text;
      if (typeof c.thinking === "string") return c.thinking;
      return "";
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function stripProjectWrapper(name: string): string {
  return name.startsWith("--") && name.endsWith("--") ? name.slice(2, -2) : name;
}

function projectFromPath(path: string): string {
  const parts = path.split("/");
  const sessionsIdx = parts.lastIndexOf("sessions");
  return sessionsIdx >= 0 && sessionsIdx < parts.length - 1
    ? parts[sessionsIdx + 1]
    : "unknown";
}

async function cmdListAll(projectFilter?: string, verbose = false, json = false) {
  const sessions = await SessionManager.listAll();
  const projectMap = new Map<string, SessionInfo[]>();

  for (const s of sessions) {
    const projectDir = projectFromPath(s.path);
    if (projectFilter && stripProjectWrapper(projectDir) !== projectFilter && projectDir !== projectFilter) continue;
    if (!projectMap.has(projectDir)) projectMap.set(projectDir, []);
    projectMap.get(projectDir)!.push(s);
  }

  if (json) {
    const result: Record<string, unknown>[] = [];
    for (const proj of [...projectMap.keys()].sort()) {
      const projSessions = projectMap.get(proj)!;
      projSessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
      for (const s of projSessions) {
        result.push({
          date: s.created.toISOString().replace("T", " ").slice(0, 19),
          messageCount: s.messageCount,
          project: stripProjectWrapper(proj),
          path: s.path,
        });
      }
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const proj of [...projectMap.keys()].sort()) {
    const projSessions = projectMap.get(proj)!;
    projSessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    const shortProj = stripProjectWrapper(proj);
    for (const s of projSessions) {
      const date = s.created.toISOString().replace("T", " ").slice(0, 19);
      if (verbose) {
        console.log(`${date}  ${String(s.messageCount).padStart(4)} msgs  ${shortProj}`);
        console.log(`         ${s.path}`);
      } else {
        console.log(`${date}  ${String(s.messageCount).padStart(4)} msgs  ${shortProj}`);
      }
    }
  }
}

async function cmdList(json = false) {
  const sessions = await SessionManager.listAll();
  const projects = [...new Set(sessions.map(s => stripProjectWrapper(projectFromPath(s.path))))].sort();
  if (json) {
    console.log(JSON.stringify(projects, null, 2));
    return;
  }
  for (const p of projects) {
    console.log(p);
  }
}

async function cmdFind(query: string, json = false) {
  const sessions = await SessionManager.listAll();
  const lower = query.toLowerCase();
  const matches: Record<string, unknown>[] = [];
  for (const s of sessions) {
    const proj = projectFromPath(s.path);
    const shortProj = stripProjectWrapper(proj);
    if (s.path.toLowerCase().includes(lower) || shortProj.toLowerCase().includes(lower)) {
      if (json) {
        matches.push({
          date: s.created.toISOString().replace("T", " ").slice(0, 19),
          messageCount: s.messageCount,
          project: shortProj,
          path: s.path,
        });
      } else {
        const date = s.created.toISOString().replace("T", " ").slice(0, 19);
        console.log(`${date}  ${String(s.messageCount).padStart(4)} msgs  ${shortProj}  ${s.path}`);
      }
    }
  }
  // Also search tintinweb subagent outputs
  for (const o of findSubagentOutputs()) {
    if (o.path.toLowerCase().includes(lower) || o.agentId.toLowerCase().includes(lower) || o.sessionId.toLowerCase().includes(lower)) {
      if (json) {
        matches.push({
          type: "subagent",
          agent: o.agentId,
          session: o.sessionId.slice(0, 8),
          cwd: o.cwd,
          path: o.path,
        });
      } else {
        const size = statSync(o.path).size;
        console.log(`subagent  ${o.agentId.padEnd(15)} ${o.sessionId.slice(0, 8)}  ${(size/1024).toFixed(1)}KB  ${o.path}`);
      }
    }
  }
  if (json) console.log(JSON.stringify(matches, null, 2));
}

function cmdSummary(entries: SessionEntry[], json = false) {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (isMessageEntry(e)) {
      counts.set(e.message.role, (counts.get(e.message.role) ?? 0) + 1);
    }
  }
  if (json) {
    console.log(JSON.stringify(Object.fromEntries(counts), null, 2));
    return;
  }
  for (const [role, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(count).padStart(6)}  ${role}`);
  }
}

function cmdLast(entries: SessionEntry[], n: number, json = false) {
  const msgs = entries.filter(isMessageEntry).slice(-n);
  if (json) {
    console.log(JSON.stringify(msgs.map(e => ({ role: e.message.role, text: extractText(e.message) })), null, 2));
    return;
  }
  for (const e of msgs) console.log(`${e.message.role}\t${extractText(e.message)}`);
}

function cmdFirst(entries: SessionEntry[], n: number, json = false) {
  const msgs = entries.filter(isMessageEntry).slice(0, n);
  if (json) {
    console.log(JSON.stringify(msgs.map(e => ({ role: e.message.role, text: extractText(e.message) })), null, 2));
    return;
  }
  for (const e of msgs) console.log(`${e.message.role}\t${extractText(e.message)}`);
}

function cmdRole(entries: SessionEntry[], role: string, json = false) {
  const msgs = entries.filter(e => isMessageEntry(e) && e.message.role === role);
  if (json) {
    console.log(JSON.stringify(msgs.map(e => ({ role: e.message.role, text: extractText(e.message) })), null, 2));
    return;
  }
  for (const e of msgs) console.log(extractText(e.message));
}

function cmdGrep(entries: SessionEntry[], text: string, roleFilter?: string, json = false) {
  const normalized = normalizeWhitespace(text);
  const matches: { role: string; text: string }[] = [];

  for (const e of entries) {
    if (isMessageEntry(e)) {
      if (roleFilter && e.message.role !== roleFilter) continue;
      const content = extractAllText(e.message);
      const matched = fuzzyMatch(content, normalized);
      if (matched) {
        if (json) {
          matches.push({ role: e.message.role, text: content });
        } else {
          console.log(`${e.message.role}\t${content}`);
        }
      }
    }
  }
  if (json) console.log(JSON.stringify(matches, null, 2));
}

// ---------------------------------------------------------------------------
// Context-around-match — show N messages before/after each match.
// Fixes the ad-hoc Python scripts we kept writing (with syntax errors on
// f-strings containing the query text). Common question this answers:
//   "the agent wrote `as any` — what was the user asking for right before?"
// ---------------------------------------------------------------------------

interface MessageSlot {
  index: number;            // index in the filtered message list
  role: string;
  text: string;             // human-readable text (text blocks joined)
  timestamp: string;
}

/** Collect all message entries into compact slots (for context display). */
function collectMessageSlots(entries: SessionEntry[]): MessageSlot[] {
  const slots: MessageSlot[] = [];
  let i = 0;
  for (const e of entries) {
    if (!isMessageEntry(e)) continue;
    slots.push({
      index: i++,
      role: e.message.role,
      text: extractAllText(e.message),
      timestamp: (e as { timestamp?: string }).timestamp ?? "",
    });
  }
  return slots;
}

function cmdContext(
  entries: SessionEntry[],
  text: string,
  around: number,
  roleFilter?: string,
  json = false,
) {
  const normalized = normalizeWhitespace(text);
  const slots = collectMessageSlots(entries).filter(
    s => !roleFilter || s.role === roleFilter || true, // roleFilter applies to MATCHES only; context keeps all roles
  );

  const matchIdxs: number[] = [];
  for (const s of slots) {
    if (roleFilter && s.role !== roleFilter) continue;
    if (fuzzyMatch(s.text, normalized)) matchIdxs.push(s.index);
  }

  if (matchIdxs.length === 0) {
    if (!json) console.error(`No matches for "${text}".`);
    else console.log(JSON.stringify({ matches: 0, groups: [] }, null, 2));
    return;
  }

  // Build non-overlapping windows [start, end] around each match.
  const groups: { matchIndex: number; before: MessageSlot[]; match: MessageSlot; after: MessageSlot[] }[] = [];
  let lastEnd = -1;
  for (const mi of matchIdxs) {
    const start = Math.max(0, mi - around);
    const end = Math.min(slots.length - 1, mi + around);
    // If overlaps previous window, merge (avoid double-printing).
    if (start <= lastEnd) {
      // extend previous group
      const g = groups[groups.length - 1];
      for (let j = lastEnd + 1; j <= end; j++) {
        if (j === mi) continue;
        if (j < mi) g.before.push(slots[j]);
        else g.after.push(slots[j]);
      }
      lastEnd = end;
      continue;
    }
    groups.push({
      matchIndex: mi,
      before: slots.slice(start, mi),
      match: slots[mi],
      after: slots.slice(mi + 1, end + 1),
    });
    lastEnd = end;
  }

  if (json) {
    console.log(JSON.stringify({
      matches: matchIdxs.length,
      groups: groups.map(g => ({
        matchIndex: g.matchIndex,
        match: { role: g.match.role, text: g.match.text, timestamp: g.match.timestamp },
        before: g.before.map(s => ({ role: s.role, text: s.text, timestamp: s.timestamp })),
        after:  g.after.map(s => ({ role: s.role, text: s.text, timestamp: s.timestamp })),
      })),
    }, null, 2));
    return;
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    if (gi > 0) console.log(`${"─".repeat(60)}`);
    console.log(`### match ${gi + 1}/${groups.length}  (msg #${g.matchIndex})`);
    for (const s of g.before) console.log(`  ${fmtSlot(s)}`);
    console.log(`▶ ${fmtSlot(g.match)}`);
    for (const s of g.after) console.log(`  ${fmtSlot(s)}`);
  }
}

function fmtSlot(s: MessageSlot): string {
  const ts = s.timestamp ? s.timestamp.slice(11, 19) + "  " : "";
  const role = s.role.padEnd(9);
  const text = s.text.length > 200 ? s.text.slice(0, 197) + "…" : s.text;
  return `${ts}${role}${text}`;
}

// ---------------------------------------------------------------------------
// Tool usage — extract tool_use calls from assistant messages.
// Replaces ad-hoc `grep -oE 'chrome-devtools\.[a-z_]+' | sort | uniq -c`.
// ---------------------------------------------------------------------------

/** Extract tool-call blocks from a raw message (no SDK needed).
 *  pi SDK persists these as `type: "toolCall"` with `name` + `arguments`
 *  (NOT Anthropic's `tool_use`/`input` — we check both for safety). */
function extractToolUses(message: SessionMessageEntry["message"]): { name: string; input: unknown }[] {
  if (!Array.isArray(message.content)) return [];
  return message.content
    .filter((c): c is Record<string, unknown> => {
      if (typeof c !== "object" || c === null) return false;
      const t = (c as { type?: string }).type;
      return t === "toolCall" || t === "tool_use" || t === "tool_call";
    })
    .map(c => ({
      name: (c as { name?: string }).name ?? "",
      input: (c as { arguments?: unknown; input?: unknown }).arguments
        ?? (c as { input?: unknown }).input ?? {},
    }));
}

function cmdToolUsage(entries: SessionEntry[], filter?: string, json = false) {
  const counts = new Map<string, number>();
  const samples = new Map<string, unknown>();
  const filterRe = filter ? new RegExp(filter, "i") : null;

  for (const e of entries) {
    if (!isMessageEntry(e) || e.message.role !== "assistant") continue;
    for (const tu of extractToolUses(e.message)) {
      if (filterRe && !filterRe.test(tu.name)) continue;
      counts.set(tu.name, (counts.get(tu.name) ?? 0) + 1);
      if (!samples.has(tu.name)) samples.set(tu.name, tu.input);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (json) {
    console.log(JSON.stringify({
      total: sorted.reduce((n, [, c]) => n + c, 0),
      unique: sorted.length,
      tools: sorted.map(([name, count]) => ({ name, count, sample: samples.get(name) })),
    }, null, 2));
    return;
  }

  if (sorted.length === 0) {
    console.log(filter ? `No tool calls matching /${filter}/.` : "No tool calls in session.");
    return;
  }
  const total = sorted.reduce((n, [, c]) => n + c, 0);
  console.log(`# ${total} tool calls, ${sorted.length} unique${filter ? ` (filter: /${filter}/)` : ""}\n`);
  for (const [name, count] of sorted) {
    const pct = ((count / total) * 100).toFixed(0);
    console.log(`${String(count).padStart(5)}  ${pct.padStart(3)}%  ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Timeline — reconstruct workflow as a sequence of user messages + tool calls.
// Answers "what did the agent actually DO in order?" without scrolling JSONL.
// ---------------------------------------------------------------------------

function cmdTimeline(entries: SessionEntry[], limit = 0, json = false) {
  const events: { ts: string; kind: "user" | "tool"; text: string; tool?: string }[] = [];
  for (const e of entries) {
    if (!isMessageEntry(e)) continue;
    const ts = (e as { timestamp?: string }).timestamp ?? "";
    if (e.message.role === "user") {
      const t = extractText(e.message).trim();
      if (!t || t.startsWith("<")) continue;  // skip system/tool noise
      events.push({ ts, kind: "user", text: t });
    } else if (e.message.role === "assistant") {
      for (const tu of extractToolUses(e.message)) {
        events.push({
          ts,
          kind: "tool",
          tool: tu.name,
          text: typeof tu.input === "object" && tu.input !== null
            ? JSON.stringify(tu.input).slice(0, 120)
            : String(tu.input).slice(0, 120),
        });
      }
    }
  }

  const slice = limit > 0 ? events.slice(-limit) : events;

  if (json) {
    console.log(JSON.stringify(slice, null, 2));
    return;
  }

  for (const ev of slice) {
    const ts = ev.ts ? ev.ts.slice(11, 19) + "  " : "";
    if (ev.kind === "user") {
      const text = ev.text.length > 180 ? ev.text.slice(0, 177) + "…" : ev.text;
      console.log(`${ts}USER  ${text}`);
    } else {
      const tool = (ev.tool ?? "?").padEnd(28);
      console.log(`${ts}      ${tool}${ev.text}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Tintinweb subagent output files
// ---------------------------------------------------------------------------

/** Path: /tmp/pi-subagents-<uid>/<cwd>/<sessionId>/tasks/<agentId>.output */
function findSubagentOutputs(): { path: string; agentId: string; sessionId: string; cwd: string }[] {
  const tmpRoot = join("/", "tmp");
  const results: { path: string; agentId: string; sessionId: string; cwd: string }[] = [];
  try {
    for (const uidDir of readdirSync(tmpRoot)) {
      if (!uidDir.startsWith("pi-subagents-")) continue;
      const uidPath = join(tmpRoot, uidDir);
      if (!statSync(uidPath).isDirectory()) continue;
      for (const cwdEnc of readdirSync(uidPath)) {
        const cwdPath = join(uidPath, cwdEnc);
        if (!statSync(cwdPath).isDirectory()) continue;
        for (const sessDir of readdirSync(cwdPath)) {
          const tasksDir = join(cwdPath, sessDir, "tasks");
          try {
            for (const f of readdirSync(tasksDir)) {
              if (!f.endsWith(".output")) continue;
              results.push({
                path: join(tasksDir, f),
                agentId: f.replace(".output", ""),
                sessionId: sessDir,
                cwd: cwdEnc.replace(/-/g, "/"),
              });
            }
          } catch { /* no tasks dir */ }
        }
      }
    }
  } catch { /* /tmp not accessible */ }
  return results.sort((a, b) => {
    try { return statSync(b.path).mtimeMs - statSync(a.path).mtimeMs; } catch { return 0; }
  });
}

function cmdListSubagents(json = false) {
  const outputs = findSubagentOutputs();
  if (json) {
    const result = outputs.map(o => ({
      agent: o.agentId,
      session: o.sessionId.slice(0, 8),
      cwd: o.cwd,
      path: o.path,
      size: statSync(o.path).size,
    }));
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (outputs.length === 0) {
    console.log("No tintinweb subagent output files found.");
    return;
  }
  for (const o of outputs) {
    const size = statSync(o.path).size;
    const kb = (size / 1024).toFixed(1);
    console.log(`${o.agentId.padEnd(18)} ${o.sessionId.slice(0, 8)}  ${kb.padStart(6)}KB  ${o.path}`);
  }
}

/** Load entries from a tintinweb .output file (Claude Code JSONL format) */
function loadSubagentEntries(path: string): { role: string; text: string; timestamp: string }[] {
  const { readFileSync } = require("node:fs");
  try {
    const raw = readFileSync(path, "utf-8");
    return raw.split("\n")
      .filter(Boolean)
      .map(line => {
        try {
          const obj = JSON.parse(line);
          const role = obj.message?.role ?? obj.type ?? "unknown";
          const text = typeof obj.message?.content === "string"
            ? obj.message.content
            : JSON.stringify(obj.message?.content ?? "");
          return { role, text, timestamp: obj.timestamp ?? "" };
        } catch { return null; }
      })
      .filter(Boolean) as { role: string; text: string; timestamp: string }[];
  } catch {
    return [];
  }
}

/** Fast grep across a directory of JSONL files using rg */
function cmdGrepDir(dir: string, text: string, roleFilter?: string, json = false) {
  const rg = findRg();
  if (!rg) {
    console.error("rg (ripgrep) not found. Install it or set PI_BIN_DIR.");
    console.error("  brew install ripgrep");
    process.exit(1);
  }

  const files = listJsonlFiles(dir);
  if (files.length === 0) {
    console.error(`No .jsonl files found in: ${dir}`);
    process.exit(1);
  }

  const results = rgGrep(rg, files, text, roleFilter);

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const r of results) {
    console.log(`${r.file}  ${r.role}\t${r.text}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`pi-session — inspect pi agent session JSONL files

DISCOVERY (no session file needed):
  pi-session --list                  List all projects
  pi-session --list --json           List projects as JSON array
  pi-session --list-sessions [PROJ]  List sessions with message counts
  pi-session --list-sessions -v      List sessions with file paths
  pi-session --list-sessions --json  List sessions as JSON
  pi-session --find TEXT             Fuzzy-find by text (UUID, project)
  pi-session --find TEXT --json      Fuzzy-find as JSON
  pi-session --list-subagents        List tintinweb subagent output files
  pi-session --list-subagents --json List subagents as JSON

SEARCH (across multiple sessions):
  pi-session --grep-dir DIR TEXT     Fast grep across all JSONL in DIR
  pi-session --grep-dir DIR TEXT --role user
  pi-session --grep-dir DIR TEXT --json

INSPECT (requires session file):
  pi-session <file.jsonl>            Show summary + first 3 messages (default)
  pi-session <file.jsonl> --summary  Message counts by role
  pi-session <file.jsonl> --last N   Last N messages
  pi-session <file.jsonl> --first N  First N messages
  pi-session <file.jsonl> --role ROLE  Filter by role
  pi-session <file.jsonl> --grep TEXT  Search in message text
  pi-session <file.jsonl> --grep TEXT --role user

CONTEXT & WORKFLOW (requires session file):
  pi-session <file> --context N TEXT   Match TEXT, print N messages around each
                                       (use --role to restrict matches only)
  pi-session <file> --context 5 "as any" --role assistant
  pi-session <file> --tool-usage [REGEX]  Tool-call counts (+ sample input)
  pi-session <file> --tool-usage chrome  # filter tool names by regex
  pi-session <file> --timeline [N]       User messages + tool calls in order
  pi-session <file> --timeline 50        # last 50 events only

Run: npx tsx pi-session.ts <args> (from skill directory)`);
    return;
  }

  const first = args[0];
  const json = args.includes("--json");

  if (first === "--list") {
    await cmdList(json);
    return;
  }
  if (first === "--list-subagents") {
    cmdListSubagents(json);
    return;
  }
  if (first === "--list-sessions") {
    const verbose = args.includes("-v") || args.includes("--verbose");
    const filter = args.filter(a => !a.startsWith("-")).find(a => a !== "--list-sessions");
    await cmdListAll(filter, verbose, json);
    return;
  }
  if (first === "--find") {
    if (!args[1] || args[1].startsWith("-")) {
      console.error("Usage: pi-session --find <text>");
      console.error("  Matches by project name or session path (UUID)");
      process.exit(1);
    }
    await cmdFind(args[1], json);
    return;
  }
  if (first === "--grep-dir") {
    if (!args[1] || args[1].startsWith("-") || !args[2]) {
      console.error("Usage: pi-session --grep-dir <dir> <text> [--role ROLE] [--json]");
      process.exit(1);
    }
    const roleIdx = args.indexOf("--role");
    const roleFilter = roleIdx >= 0 && roleIdx + 1 < args.length ? args[roleIdx + 1] : undefined;
    cmdGrepDir(args[1], args[2], roleFilter, json);
    return;
  }

  // Inspection commands
  const path = first;
  const cmd = args[1];

  try {
    const entries = loadEntries(path);
    switch (cmd) {
      case undefined:
      case "--json":
        if (json) {
          // Output single JSON object for pipelining
          const summaryCounts: Record<string, number> = {};
          for (const e of entries) {
            if (isMessageEntry(e)) {
              summaryCounts[e.message.role] = (summaryCounts[e.message.role] ?? 0) + 1;
            }
          }
          const first3 = entries
            .filter(isMessageEntry)
            .slice(0, 3)
            .map((e) => ({ role: e.message.role, text: extractText(e.message) }));
          console.log(JSON.stringify({ summary: summaryCounts, first: first3 }, null, 2));
        } else {
          cmdSummary(entries, false);
          console.log();
          cmdFirst(entries, 3, false);
        }
        break;
      case "--summary":
        cmdSummary(entries, json);
        break;
      case "--last":
        cmdLast(entries, parseInt(args[2] ?? "10", 10), json);
        break;
      case "--first":
        cmdFirst(entries, parseInt(args[2] ?? "10", 10), json);
        break;
      case "--role":
        cmdRole(entries, args[2] ?? "user", json);
        break;
      case "--grep": {
        // Support --grep TEXT --role ROLE
        let query: string = "";
        let roleFilter: string | undefined;
        if (args[2] && !args[2].startsWith("-")) {
          query = args[2];
          // Check for --role after query
          const roleIdx = args.indexOf("--role", 3);
          if (roleIdx >= 0 && roleIdx + 1 < args.length) {
            roleFilter = args[roleIdx + 1];
          }
        }
        cmdGrep(entries, query, roleFilter, json);
        break;
      }
      case "--context": {
        // --context N TEXT [--role ROLE]
        if (!args[2] || !args[3]) {
          console.error("Usage: pi-session <file> --context <N> <text> [--role ROLE]");
          process.exit(1);
        }
        const around = parseInt(args[2], 10);
        const roleIdx = args.indexOf("--role", 3);
        const roleFilter = roleIdx >= 0 && roleIdx + 1 < args.length ? args[roleIdx + 1] : undefined;
        cmdContext(entries, args[3], around, roleFilter, json);
        break;
      }
      case "--tool-usage": {
        // --tool-usage [REGEX]
        const filter = args[2] && !args[2].startsWith("-") ? args[2] : undefined;
        cmdToolUsage(entries, filter, json);
        break;
      }
      case "--timeline": {
        // --timeline [N]
        const limit = args[2] && /^\d+$/.test(args[2]) ? parseInt(args[2], 10) : 0;
        cmdTimeline(entries, limit, json);
        break;
      }
      default:
        console.error(`Unknown command: ${cmd}`);
        console.error("Run pi-session --help for usage.");
        process.exit(1);
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      console.error(`File not found: ${path}`);
    } else if (err.message?.includes("JSON")) {
      console.error(`Invalid session file (not valid JSONL): ${path}`);
    } else {
      console.error(`Error reading ${path}: ${err.message}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
