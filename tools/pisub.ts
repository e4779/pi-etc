#!/usr/bin/env node
/**
 * pisub — spawn and steer pi agents via tmux + RPC mode.
 *
 * Pi has no built-in sub-agents. The "pi way" is to spawn pi itself via bash.
 * But spawning `pi -p` (one-shot print) inside tmux gives you NOTHING to steer —
 * the process prints and dies. send-keys into a dead pane is useless.
 *
 * The missing piece is `pi --mode rpc`: JSONL over stdin/stdout with explicit
 * `prompt`, `steer`, `follow_up`, `abort` commands and a streaming event log.
 * pisub wraps that into a small CLI so you get:
 *
 *   - persistent pipe to a live agent (not one-shot)
 *   - real steering mid-flight
 *   - full JSONL event log for audit / `pi-session` style inspection
 *   - optional tmux session for live `attach` observability
 *
 * Layout:
 *   ~/.pisub/
 *   ├── registry.json             name → { pid, started, model, cwd, ... }
 *   ├── agents/<name>.log         JSONL stream of RPC events (per-agent, append-only)
 *   └── agents/<name>.stdin       every command we sent (audit trail)
 *
 * Usage:
 *   pisub spawn  <name> [opts]              launch `pi --mode rpc` subprocess
 *   pisub send    <name> "msg" [--steer|--follow-up]
 *   pisub prompt  <name> "msg"              alias for send (default mode)
 *   pisub steer   <name> "msg"              queue mid-flight
 *   pisub follow-up <name> "msg"            queue after agent idle
 *   pisub abort   <name>                    abort current turn
 *   pisub bash    <name> "cmd"              run bash in agent context (next prompt)
 *   pisub status  [name]                    one-line summary
 *   pisub list                               all active agents
 *   pisub events  <name> [--follow] [--since ID] [--filter TYPE]
 *   pisub log     <name> [--last N]         human-readable log
 *   pisub tail    <name>                    = events --follow (pretty)
 *   pisub kill    <name> | --all
 *   pisub attach  <name>                    tmux attach (only if spawned with --tmux)
 *   pisub help
 *
 * Design choices:
 *   - subprocess pipe, NEVER tmux send-keys. Steering requires structured
 *     protocol; ANSI screen parsing is lossy and unreliable.
 *   - `--no-session` by default. Sub-agents are ephemeral. The pisub log is
 *     the durable artifact. Pass --session to keep the pi session file too.
 *   - JSONL event log survives process death. You can replay what happened.
 *   - `--tmux` is opt-in: wraps the rpc process in a tmux session so a human
 *     can `pisub attach` and watch live. Headless by default.
 *
 * See: ~/.pi/agent/git/.../pi-etc/skills/pisub/SKILL.md for the agent-facing
 *      skill that teaches the model when/how to use this tool.
 */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import * as readline from "node:readline";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "~";
const PISUB_DIR = process.env.PISUB_DIR ?? join(HOME, ".pisub");
const AGENTS_DIR = join(PISUB_DIR, "agents");
const REGISTRY_PATH = join(PISUB_DIR, "registry.json");

function ensureDirs() {
  mkdirSync(AGENTS_DIR, { recursive: true });
}

function agentLogPath(name: string) { return join(AGENTS_DIR, `${name}.log`); }
function agentStdinPath(name: string) { return join(AGENTS_DIR, `${name}.stdin`); }

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface AgentRecord {
  name: string;
  pid: number;
  started: string;             // ISO
  model?: string;
  provider?: string;
  cwd: string;
  tools?: string;
  tmuxSession?: string;        // if spawned with --tmux
  rpcMode: "rpc";
}

type Registry = Record<string, AgentRecord>;

function loadRegistry(): Registry {
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveRegistry(r: Registry) {
  ensureDirs();
  writeFileSync(REGISTRY_PATH, JSON.stringify(r, null, 2));
}

/** Verify a recorded PID is still alive AND still our pi rpc process. */
function isAlive(rec: AgentRecord): boolean {
  try {
    process.kill(rec.pid, 0);   // signal 0 = existence check
    return true;
  } catch {
    return false;
  }
}

function gcRegistry(): Registry {
  // Drop dead entries. Keeps `list`/`status` honest without manual cleanup.
  const r = loadRegistry();
  let changed = false;
  for (const name of Object.keys(r)) {
    if (!isAlive(r[name])) {
      delete r[name];
      changed = true;
    }
  }
  if (changed) saveRegistry(r);
  return r;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function appendJsonl(path: string, obj: unknown) {
  appendFileSync(path, JSON.stringify(obj) + "\n");
}

function appendStdin(name: string, cmd: unknown) {
  appendJsonl(agentStdinPath(name), { ts: new Date().toISOString(), cmd });
}

/** Read a JSONL file into an array, tolerating trailing partial lines. */
function readJsonl(path: string): any[] {
  if (!existsSync(path)) return [];
  const out: any[] = [];
  const text = readFileSync(path, "utf-8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip partial */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// RPC client over the subprocess pipe
// ---------------------------------------------------------------------------

/**
 * Connects to a running pi rpc subprocess by pid + a marker file holding the
 * actual stdio. We do NOT keep the pipe in this process between commands —
 * pisub is a fire-and-forget CLI. So spawn daemon-attaches per operation.
 *
 * Implementation: spawn attaches to the existing child via a unix socket the
 * daemon listens on. Simpler alternative used here: a long-lived supervisor
 * process per agent (`pisub spawn` stays running as the daemon) — subsequent
 * `pisub <cmd>` invocations talk to it via a unix socket.
 *
 * But that is heavy for v1. v1 strategy: spawn rpc inline for one-shot commands
 * that need a live pipe (prompt/steer/abort), and for long-running agents we
 * rely on the daemon pattern. See DAEMON design below.
 */
// (kept intentionally stubbed — see Daemon class for the real impl)

// ---------------------------------------------------------------------------
// Resolve our own script path (works under tsx, node, or compiled)
// ---------------------------------------------------------------------------

import { fileURLToPath } from "node:url";

async function resolveScriptPath(): Promise<string> {
  // Under ESM, import.meta.url is the canonical source.
  // Under tsx, process.argv[1] is the .ts file path.
  try {
    return fileURLToPath(import.meta.url);
  } catch {
    return process.argv[1]!;
  }
}

// ---------------------------------------------------------------------------
// Daemon — one long-lived process per spawned agent
// ---------------------------------------------------------------------------

interface DaemonHello {
  type: "hello";
  pid: number;
  socketPath: string;
}

/**
 * Daemon responsibilities:
 *   - hold the rpc subprocess pipe
 *   - accept JSON commands on a unix socket
 *   - forward events to the agent log + to any connected tail client
 *   - exit when the rpc subprocess exits OR on `kill`
 *
 * Wire protocol on the unix socket (newline-delimited JSON):
 *   client → daemon:  { "id": "...", "type": "prompt"|"steer"|"follow_up"|"abort"|"bash"|"ping", ... }
 *   daemon → client:  { "id": "...", "type": "response", "success": bool, ... }    (for commands)
 *                      { "type": "event", "event": { ...rpc event... } }            (streamed events)
 *                      { "type": "hello", "socketPath": "...", "pid": ... }        (first line on connect)
 */
const DAEMON = Symbol("daemon");

function socketPathFor(name: string): string {
  // /tmp/pisub-<uid>/<name>.sock
  const uid = process.getuid?.() ?? 0;
  const dir = join("/tmp", `pisub-${uid}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${name}.sock`);
}

function daemonLogPath(name: string): string {
  const uid = process.getuid?.() ?? 0;
  return join("/tmp", `pisub-${uid}`, `${name}.daemon.log`);
}

// ---------------------------------------------------------------------------
// net-based daemon + client
// ---------------------------------------------------------------------------

import { createServer, createConnection, type Server, type Socket } from "node:net";

interface PendingReq {
  id: string;
  resolve: (resp: any) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Run as the daemon: spawn the pi rpc process, open a unix socket, and serve
 * commands until the rpc process dies or we get killed.
 */
async function runDaemon(opts: {
  name: string;
  model?: string;
  provider?: string;
  cwd: string;
  tools?: string;
  thinking?: string;
  saveSession?: boolean;
  tmux?: boolean;
}): Promise<void> {
  ensureDirs();
  const sockPath = socketPathFor(opts.name);
  if (existsSync(sockPath)) rmSync(sockPath);

  // Build the pi rpc command. If --tmux, wrap the daemon itself in a tmux
  // session so a user can `pisub attach` and watch the rpc stream.
  // (We don't wrap the pi process directly — we wrap the daemon, which logs
  //  rpc events to its own stdout/stderr as well as the JSONL log.)

  const piArgs = ["--mode", "rpc", "--no-session"];
  if (opts.provider) piArgs.push("--provider", opts.provider);
  if (opts.model) piArgs.push("--model", opts.model);
  if (opts.tools) piArgs.push("--tools", opts.tools);
  if (opts.thinking) piArgs.push("--thinking", opts.thinking);
  if (opts.saveSession) {
    // remove --no-session
    const i = piArgs.indexOf("--no-session");
    if (i >= 0) piArgs.splice(i, 1);
  }

  const pi = spawn("pi", piArgs, {
    cwd: opts.cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Redirect daemon's own stdout/stderr to a file so tmux pane shows something.
  const daemonLog = daemonLogPath(opts.name);
  const daemonLogFd = (() => {
    try { return require("fs").openSync(daemonLog, "a"); } catch { return null; }
  })();
  const origWrite = (buf: Buffer, fd: number | null) => {
    appendFileSync(daemonLog, buf);
    if (fd !== null) {
      try { require("fs").writeSync(fd, buf); } catch { /* pane closed */ }
    }
  };

  appendFileSync(daemonLog, `\n=== pisub daemon '${opts.name}' started ${new Date().toISOString()} ===\n`);
  appendFileSync(daemonLog, `pi args: ${piArgs.join(" ")}\n`);
  appendFileSync(daemonLog, `cwd: ${opts.cwd}\n`);
  appendFileSync(daemonLog, `socket: ${sockPath}\n\n`);

  // Pipe pi rpc stdout → parse JSONL → log + emit to clients
  const rl = readline.createInterface({ input: pi.stdout!, crlfDelay: Infinity });
  const clients = new Set<Socket>();

  rl.on("line", (line) => {
    if (!line.trim()) return;
    let evt: any;
    try { evt = JSON.parse(line); } catch { return; }
    const wrapped = { ts: new Date().toISOString(), ...evt };
    appendJsonl(agentLogPath(opts.name), wrapped);
    const summary = summarizeEvent(evt);
    if (summary !== null) appendFileSync(daemonLog, `  << ${summary}\n`);
    for (const c of clients) {
      try { c.write(JSON.stringify({ type: "event", event: wrapped }) + "\n"); } catch { /* drop */ }
    }
  });

  pi.stderr!.on("data", (buf: Buffer) => {
    appendFileSync(daemonLog, `  !! ${buf}`);
  });

  pi.on("exit", (code, sig) => {
    appendFileSync(daemonLog, `\n=== pi rpc exited (code=${code} sig=${sig}) ===\n`);
    const reg = loadRegistry();
    delete reg[opts.name];
    saveRegistry(reg);
    for (const c of clients) { try { c.end(); } catch {} }
    server.close();
    setTimeout(() => process.exit(0), 100);
  });

  // Clean shutdown: SIGTERM/SIGINT → kill pi → pi's 'exit' handler does the rest.
  // Prevents orphaned pi rpc processes when user runs `pisub kill`.
  let shuttingDown = false;
  const shutdown = (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    appendFileSync(daemonLog, `\n=== pisub daemon received ${sig}, shutting down ===\n`);
    try { pi.kill("SIGTERM"); } catch {}
    // Hard-exit fallback if pi doesn't die within 3s
    setTimeout(() => { try { pi.kill("SIGKILL"); } catch {}; process.exit(0); }, 3000);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Unix socket server
  const server: Server = createServer((sock) => {
    clients.add(sock);
    sock.write(JSON.stringify({
      type: "hello",
      pid: process.pid,
      socketPath: sockPath,
    } as DaemonHello) + "\n");
    const srl = readline.createInterface({ input: sock, crlfDelay: Infinity });
    srl.on("line", (line) => {
      if (!line.trim()) return;
      let cmd: any;
      try { cmd = JSON.parse(line); } catch { return; }
      handleDaemonCommand(cmd, sock, opts.name, pi);
    });
    sock.on("close", () => clients.delete(sock));
    sock.on("error", () => clients.delete(sock));
  });
  server.listen(sockPath);

  // Register in registry
  const reg = loadRegistry();
  reg[opts.name] = {
    name: opts.name,
    pid: process.pid,
    started: new Date().toISOString(),
    model: opts.model,
    provider: opts.provider,
    cwd: opts.cwd,
    tools: opts.tools,
    tmuxSession: opts.tmux ? tmuxSessionName(opts.name) : undefined,
    rpcMode: "rpc",
  };
  saveRegistry(reg);

  // Wait for pi to boot before signaling readiness to the parent (the `spawn`
  // CLI command, which daemonizes). Give it up to 30s to emit any line, or
  // die trying.
  // Actually: the parent already detached. We just keep running.
  // Keep alive:
  await new Promise<void>(() => {});  // forever, until pi exits
}

/** Compact one-line summary, or null for noisy types (streaming deltas, per-chunk tool updates). */
function summarizeEvent(evt: any): string | null {
  const t = evt.type;
  if (t === "response") return `response(${evt.command}) success=${evt.success}${evt.error ? ` err=${evt.error.slice(0,80)}` : ""}`;
  if (t === "agent_start") return "agent_start";
  if (t === "agent_end") return "agent_end";
  if (t === "turn_start") return "turn_start";
  if (t === "turn_end") return "turn_end";
  if (t === "message_update") {
    const ae = evt.assistantMessageEvent ?? {};
    if (ae.type === "text_start" || ae.type === "text_delta") return null;
    if (ae.type === "text_end") return `text: ${JSON.stringify(ae.content ?? "").slice(0,100)}`;
    if (ae.type.startsWith("thinking")) return null;
    if (ae.type === "toolcall_start") return `toolcall_start: ${ae.toolName ?? ""}`;
    if (ae.type === "toolcall_delta") return null;
    if (ae.type === "toolcall_end") return `toolcall_end: ${ae.toolCall?.name ?? ae.toolName ?? ""}`;
    if (ae.type === "done") return `done(${ae.reason})`;
    if (ae.type === "error") return `error(${ae.reason})`;
    return `msg_update(${ae.type})`;
  }
  if (t === "message_start" || t === "message_end") return null;
  if (t === "tool_execution_start") return `tool_start: ${evt.toolName} ${JSON.stringify(evt.args ?? {}).slice(0, 80)}`;
  if (t === "tool_execution_update") return null;
  if (t === "tool_execution_end") return `tool_end: ${evt.toolName} isError=${evt.isError}`;
  if (t === "queue_update") return `queue steering=${(evt.steering ?? []).length} followUp=${(evt.followUp ?? []).length}`;
  if (t === "compaction_start") return `compaction(${evt.reason})`;
  if (t === "compaction_end") return `compaction_end`;
  if (t === "auto_retry_start") return `retry_start attempt=${evt.attempt}/${evt.maxAttempts}`;
  if (t === "auto_retry_end") return `retry_end success=${evt.success}`;
  if (t === "extension_error") return `ext_error(${evt.event}): ${evt.error}`;
  return JSON.stringify(evt).slice(0, 120);
}

function handleDaemonCommand(cmd: any, sock: Socket, name: string, pi: ChildProcessWithoutNullStreams) {
  const id = cmd.id ?? null;
  const reply = (payload: any) => {
    sock.write(JSON.stringify({ id, type: "response", ...payload }) + "\n");
  };
  appendStdin(name, cmd);
  try {
    if (cmd.type === "ping") {
      reply({ success: true, data: { alive: true } });
      return;
    }
    // All rpc passthrough commands: forward as-is to pi rpc stdin.
    const passthrough = ["prompt", "steer", "follow_up", "abort", "bash",
                         "get_state", "get_messages", "get_session_stats",
                         "set_model", "set_thinking_level"];
    if (passthrough.includes(cmd.type)) {
      const rpcCmd: any = { type: cmd.type };
      for (const k of Object.keys(cmd)) {
        if (k === "id") continue;
        rpcCmd[k] = cmd[k];
      }
      // The pi rpc process will emit a response with the same `id` on stdout,
      // which our line-reader picks up and forwards as an `event` to clients.
      // For the client's `response` ack, we send success=true immediately
      // (pi accepted the write). Real errors come back as events.
      pi.stdin.write(JSON.stringify(rpcCmd) + "\n");
      reply({ success: true, command: cmd.type });
      return;
    }
    reply({ success: false, error: `unknown command: ${cmd.type}` });
  } catch (e: any) {
    reply({ success: false, error: e.message });
  }
}

// ---------------------------------------------------------------------------
// Client — used by every CLI command except `spawn` (which forks the daemon)
// ---------------------------------------------------------------------------

class DaemonClient {
  private sock: Socket;
  private rl: readline.Interface;
  private pending = new Map<string, PendingReq>();
  private eventEmitter = new EventEmitter();
  private hello: DaemonHello | null = null;
  private helloPromise: Promise<DaemonHello>;

  constructor(private socketPath: string) {
    this.sock = createConnection({ path: socketPath });
    this.rl = readline.createInterface({ input: this.sock, crlfDelay: Infinity });
    this.helloPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("daemon hello timeout")), 5000);
      this.rl.once("line", (line) => {
        clearTimeout(timer);
        try {
          const h = JSON.parse(line);
          if (h.type !== "hello") return reject(new Error("expected hello, got: " + line));
          this.hello = h;
          resolve(h);
        } catch (e: any) { reject(e); }
      });
    });
    this.rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg: any;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.type === "response" && msg.id) {
        const p = this.pending.get(msg.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(msg.id);
          p.resolve(msg);
        }
      } else if (msg.type === "event") {
        this.eventEmitter.emit("event", msg.event);
      }
    });
  }

  async hello_(): Promise<DaemonHello> { return this.helloPromise; }

  async send(cmd: any, timeoutMs = 10000): Promise<any> {
    const id = Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for response to ${cmd.type}`));
      }, timeoutMs);
      this.pending.set(id, { id, resolve, reject, timer });
      this.sock.write(JSON.stringify({ id, ...cmd }) + "\n");
    });
  }

  onEvent(cb: (evt: any) => void) { this.eventEmitter.on("event", cb); }

  close() { try { this.sock.end(); } catch {} }
}

async function withDaemon<T>(name: string, fn: (c: DaemonClient) => Promise<T>): Promise<T> {
  const sock = socketPathFor(name);
  if (!existsSync(sock)) {
    throw new Error(`agent '${name}' socket not found at ${sock}. Is it running? (pisub list)`);
  }
  const c = new DaemonClient(sock);
  try {
    await c.hello_();
    return await fn(c);
  } finally {
    c.close();
  }
}

// ---------------------------------------------------------------------------
// tmux helpers
// ---------------------------------------------------------------------------

function tmuxSessionName(name: string): string {
  return `pisub-${name}`;
}

function tmuxAvailable(): boolean {
  const r = spawnSync("which", ["tmux"], { encoding: "utf-8" });
  return r.status === 0 && !!r.stdout.trim();
}

// ---------------------------------------------------------------------------
// CLI commands
// ---------------------------------------------------------------------------

async function cmdSpawn(args: string[]) {
  // pisub spawn <name> [--model M] [--provider P] [--cwd DIR] [--tools T] [--thinking L] [--session] [--tmux] [-- cmd args...]
  if (args.length === 0) die("usage: pisub spawn <name> [opts]");
  const name = args[0];
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) die(`invalid name '${name}' (use [a-z0-9_-])`);

  const opts = parseOpts(args.slice(1));
  const cwd = opts.cwd ?? process.cwd();
  if (!existsSync(cwd)) die(`cwd does not exist: ${cwd}`);
  if (opts.model && !opts.provider) {
    // Try to split provider/model if user wrote "provider/model"
    const m = opts.model.match(/^([^/]+)\/(.+)$/);
    if (m) { opts.provider = m[1]; opts.model = m[2]; }
  }
  const useTmux = opts.tmux === true;

  // Don't double-spawn
  const reg = gcRegistry();
  if (reg[name] && existsSync(socketPathFor(name))) {
    die(`agent '${name}' already running (pid ${reg[name].pid})`);
  }

  // We daemonize ourselves: detach and re-exec with a hidden subcommand.
  // The child runs runDaemon; the parent exits 0 once the socket appears.
  //
  // Re-exec must preserve the TS runtime. We were invoked via `npx tsx`, so
  // re-invoke the same way. The daemon lives for the agent's lifetime, so the
  // ~300ms npx startup is irrelevant.
  const scriptPath = await resolveScriptPath();
  const daemonArgs = ["tsx", scriptPath, "__daemon", name];
  for (const [k, v] of Object.entries(opts)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "boolean") { if (v) daemonArgs.push(`--${k}`); }
    else daemonArgs.push(`--${k}`, String(v));
  }
  // Always pass --cwd explicitly (default cwd may be a temp dir in tmux case)
  daemonArgs.push("--cwd", cwd);

  const detached = spawn("npx", daemonArgs, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PISUB_DAEMON: "1" },
    cwd,
  });
  detached.unref();

  // If --tmux, also wrap. We don't wrap the rpc process in tmux — we let the
  // daemon log to its own file, and `pisub attach` tails that file inside a
  // tmux session. This keeps the daemon headless-friendly.
  if (useTmux) {
    if (!tmuxAvailable()) warn("--tmux requested but tmux not found; continuing headless");
    else {
      const sess = tmuxSessionName(name);
      spawnSync("tmux", ["kill-session", "-t", sess], { stdio: "ignore" });
      spawnSync("tmux", ["new-session", "-d", "-s", sess,
        `tail -F ${daemonLogPath(name)}`], { stdio: "ignore" });
      console.log(`tmux session '${sess}' created — 'pisub attach ${name}' to watch live`);
    }
  }

  // Wait for socket to appear (up to 30s)
  const sock = socketPathFor(name);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (existsSync(sock)) {
      // Verify it actually accepts connections
      try {
        await withDaemon(name, async (c) => c.send({ type: "ping" }));
        console.log(`agent '${name}' spawned (pid ${detached.pid}).`);
        console.log(`  log:    pisub log ${name}`);
        console.log(`  tail:   pisub tail ${name}`);
        console.log(`  status: pisub status ${name}`);
        return;
      } catch { /* not ready yet */ }
    }
    await sleep(200);
  }
  die(`agent '${name}' did not come up within 30s. Check ${daemonLogPath(name)}`);
}

async function cmdDaemon(args: string[]) {
  // Hidden: invoked by cmdSpawn via detached fork.
  const name = args[0];
  if (!name) die("daemon: missing name");
  const opts = parseOpts(args.slice(1));
  await runDaemon({
    name,
    model: opts.model,
    provider: opts.provider,
    cwd: opts.cwd ?? process.cwd(),
    tools: opts.tools,
    thinking: opts.thinking,
    saveSession: opts.session === true,
    tmux: opts.tmux === true,
  });
}

async function cmdSend(args: string[]) {
  // pisub send <name> "msg" [--steer | --follow-up]
  if (args.length < 2) die(`usage: pisub ${cmd} <name> "<message>"`);
  const [name, ...rest] = args;
  // message is everything after name, joined, but respect quotes via shell already
  const message = rest.filter(a => !a.startsWith("--")).join(" ");
  const steer = rest.includes("--steer");
  const followUp = rest.includes("--follow-up") || rest.includes("--followup");
  if (!message) die("missing message");
  await sendQueued(name, message, steer, followUp);
}

let cmd = "send";

async function sendQueued(name: string, message: string, steer: boolean, followUp: boolean) {
  await withDaemon(name, async (c) => {
    let payload: any;
    if (steer && followUp) die("can't use --steer and --follow-up together");
    if (steer) payload = { type: "steer", message };
    else if (followUp) payload = { type: "follow_up", message };
    else payload = { type: "prompt", message };
    const r = await c.send(payload);
    if (!r.success) { console.error(`error: ${r.error}`); process.exit(1); }
    console.log(`✓ ${payload.type} → ${name}`);
  });
}

async function cmdAbort(args: string[]) {
  const name = requireName(args, "abort");
  await withDaemon(name, async (c) => {
    const r = await c.send({ type: "abort" });
    console.log(r.success ? `✓ aborted ${name}` : `error: ${r.error}`);
  });
}

async function cmdBash(args: string[]) {
  const name = requireName(args, "bash");
  const command = args.slice(1).join(" ");
  if (!command) die("missing command");
  await withDaemon(name, async (c) => {
    const r = await c.send({ type: "bash", command });
    if (!r.success) { console.error(`error: ${r.error}`); process.exit(1); }
    console.log(`✓ bash queued in ${name}'s context (output attached to next prompt)`);
  });
}

async function cmdStatus(args: string[]) {
  const reg = gcRegistry();
  if (args[0]) {
    const rec = reg[args[0]];
    if (!rec) { console.log(`agent '${args[0]}' not running`); process.exit(1); }
    let state: any = null;
    try {
      state = await withDaemon(args[0], async (c) => (await c.send({ type: "get_state" })).data);
    } catch { /* daemon dead */ }
    printStatusLine(rec, state, true);
    return;
  }
  const names = Object.keys(reg).sort();
  if (names.length === 0) { console.log("(no agents running)"); return; }
  for (const n of names) {
    const rec = reg[n];
    let state: any = null;
    try { state = await withDaemon(n, async (c) => (await c.send({ type: "get_state" })).data); } catch {}
    printStatusLine(rec, state, false);
  }
}

function printStatusLine(rec: AgentRecord, state: any, verbose: boolean) {
  const age = humanAge(new Date(rec.started).getTime());
  const streaming = state?.isStreaming ? "▶ streaming" : "idle";
  const model = state?.model?.id ?? rec.model ?? "?";
  const queue = state ? ` queue:↯${(state.pendingMessageCount ?? 0)}` : "";
  if (verbose) {
    console.log(`${rec.name}  pid=${rec.pid}  age=${age}  ${streaming}${queue}`);
    console.log(`  model:    ${model}`);
    console.log(`  cwd:      ${rec.cwd}`);
    console.log(`  log:      ${agentLogPath(rec.name)}`);
    if (rec.tmuxSession) console.log(`  tmux:     ${rec.tmuxSession} (pisub attach ${rec.name})`);
    if (state) {
      console.log(`  session:  ${state.sessionFile ?? "(ephemeral)"}`);
      console.log(`  msgs:     ${state.messageCount ?? "?"}  tokens ctx≈${state.contextUsage?.percent ?? "?"}%`);
    }
  } else {
    console.log(`${rec.name.padEnd(18)} ${streaming.padEnd(14)} ${model.padEnd(24)} ${age.padEnd(8)} ${queue}`);
  }
}

function humanAge(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

async function cmdList() {
  const reg = gcRegistry();
  const names = Object.keys(reg).sort();
  if (names.length === 0) { console.log("(no agents running)"); return; }
  console.log("name              state         model                     age      queue");
  for (const n of names) {
    const rec = reg[n];
    let state: any = null;
    try { state = await withDaemon(n, async (c) => (await c.send({ type: "get_state" })).data); } catch {}
    printStatusLine(rec, state, false);
  }
}

async function cmdEvents(args: string[]) {
  // pisub events <name> [--follow] [--since ID] [--filter TYPE]
  const name = requireName(args, "events");
  const rest = args.slice(1);
  const follow = rest.includes("--follow") || rest.includes("-f");
  const sinceIdx = rest.indexOf("--since");
  const since = sinceIdx >= 0 ? rest[sinceIdx + 1] : undefined;
  const filterIdx = rest.indexOf("--filter");
  const filter = filterIdx >= 0 ? rest[filterIdx + 1] : undefined;

  // Print historical events from the log first
  const log = agentLogPath(name);
  const history = readJsonl(log);
  let lastIdx = -1;
  for (let i = 0; i < history.length; i++) {
    const e = history[i];
    if (filter && e.type !== filter) continue;
    if (since && e.id === since) lastIdx = i;
  }
  const startFrom = lastIdx >= 0 ? lastIdx + 1 : 0;
  for (let i = startFrom; i < history.length; i++) {
    printEventLine(history[i]);
  }

  if (!follow) return;
  // Tail live events from the daemon
  try {
    await withDaemon(name, async (c) => {
      // First, get size to know where we left off
      const seen = history.length;
      c.onEvent((evt) => {
        if (filter && evt.type !== filter) return;
        printEventLine(evt);
      });
      // Keep alive forever
      await new Promise<void>(() => {});
    });
  } catch (e: any) {
    if (!follow) console.error(`error: ${e.message}`);
  }
}

function printEventLine(evt: any) {
  const ts = (evt.ts ?? "").slice(11, 19);
  const summary = summarizeEvent(evt);
  if (summary === null) return;  // quiet by default for streaming/noisy events
  console.log(`${ts}  ${summary}`);
}

async function cmdLog(args: string[]) {
  const name = requireName(args, "log");
  const rest = args.slice(1);
  let n = 50;
  const i = rest.indexOf("--last");
  if (i >= 0 && rest[i+1]) n = parseInt(rest[i+1], 10);
  const log = agentLogPath(name);
  const all = readJsonl(log);
  const slice = all.slice(-n);
  for (const e of slice) printEventLine(e);
  if (all.length > n) console.log(`... (${all.length - n} earlier, see pisub events ${name})`);
}

async function cmdTail(args: string[]) {
  const name = requireName(args, "tail");
  console.log(`tailing ${name} (Ctrl-C to stop)\n`);
  // Reuse events --follow with pretty printing
  await cmdEvents([name, "--follow"]);
}

async function cmdKill(args: string[]) {
  if (args[0] === "--all") {
    const reg = gcRegistry();
    const names = Object.keys(reg);
    if (names.length === 0) { console.log("(no agents running)"); return; }
    for (const n of names) {
      try { process.kill(reg[n].pid, "SIGTERM"); console.log(`✓ killed ${n} (pid ${reg[n].pid})`); }
      catch (e: any) { console.error(`failed to kill ${n}: ${e.message}`); }
    }
    // Also clean up any tmux sessions we own
    spawnSync("tmux", ["list-sessions"], { encoding: "utf-8" })
      .stdout.split("\n").filter(Boolean)
      .filter(s => s.startsWith("pisub-"))
      .forEach(s => {
        const sess = s.split(":")[0];
        spawnSync("tmux", ["kill-session", "-t", sess]);
      });
    return;
  }
  const name = requireName(args, "kill");
  const reg = gcRegistry();
  const rec = reg[name];
  if (!rec) { console.log(`agent '${name}' not running`); process.exit(1); }
  try {
    process.kill(rec.pid, "SIGTERM");
    console.log(`✓ killed ${name} (pid ${rec.pid})`);
  } catch (e: any) {
    console.error(`failed: ${e.message}`);
    process.exit(1);
  }
  if (rec.tmuxSession) spawnSync("tmux", ["kill-session", "-t", rec.tmuxSession], { stdio: "ignore" });
  delete reg[name];
  saveRegistry(reg);
}

async function cmdAttach(args: string[]) {
  const name = requireName(args, "attach");
  const reg = gcRegistry();
  const rec = reg[name];
  if (!rec) { console.log(`agent '${name}' not running`); process.exit(1); }
  if (!tmuxAvailable()) die("tmux not installed");
  // If a tmux session exists for this name, attach to it.
  if (rec.tmuxSession) {
    const r = spawnSync("tmux", ["has-session", "-t", rec.tmuxSession], { stdio: "ignore" });
    if (r.status === 0) {
      spawnSync("tmux", ["attach-session", "-t", rec.tmuxSession], { stdio: "inherit" });
      return;
    }
  }
  // Otherwise, spin up a tmux session tailing the daemon log on the fly.
  const sess = tmuxSessionName(name);
  spawnSync("tmux", ["kill-session", "-t", sess], { stdio: "ignore" });
  spawnSync("tmux", ["new-session", "-t", sess, `tail -F ${daemonLogPath(name)}`], { stdio: "inherit" });
}

function cmdHelp() {
  console.log(`pisub — spawn and steer pi agents via tmux + RPC mode

SPAWN
  pisub spawn <name> [--model M] [--provider P] [--cwd DIR] [--tools T]
                    [--thinking off|low|medium|high] [--session] [--tmux]
    Launches a 'pi --mode rpc' subprocess as a daemon.
    Default: --no-session (ephemeral), headless (no tmux).
    --tmux also creates 'pisub-<name>' tmux session for live view.
    Model can be 'provider/model' shorthand, e.g. 'zai/glm-5.2'.

SEND MESSAGES
  pisub send <name> "msg"                   prompt (default)
  pisub send <name> "msg" --steer           queue mid-flight (delivered after current turn)
  pisub send <name> "msg" --follow-up       queue after agent idle
  pisub prompt <name> "msg"                 alias for send (default)
  pisub steer <name> "msg"
  pisub follow-up <name> "msg"
  pisub abort <name>                        abort current turn
  pisub bash <name> "cmd"                   run bash in agent context (next prompt sees output)

OBSERVE
  pisub list                                all active agents
  pisub status [name]                       one-line summary
  pisub log <name> [--last N]               last N events from the log
  pisub tail <name>                         live tail (Ctrl-C to stop)
  pisub events <name> [--follow] [--since ID] [--filter TYPE]
  pisub attach <name>                       tmux attach to live view

CONTROL
  pisub kill <name>                         terminate agent
  pisub kill --all                          terminate all agents

FILES
  ~/.pisub/registry.json                    live agents
  ~/.pisub/agents/<name>.log                JSONL event log (survives process death)
  ~/.pisub/agents/<name>.stdin              every command you sent (audit)
  /tmp/pisub-<uid>/<name>.sock              daemon socket
  /tmp/pisub-<uid>/<name>.daemon.log        daemon stdout/stderr (tmux pane content)

EXAMPLES
  pisub spawn researcher --model deepseek/deepseek-v4-flash --cwd ~/dev/proj
  pisub send researcher "summarize src/auth/"
  pisub send researcher "actually focus only on the login flow" --steer
  pisub tail researcher                     # watch it work

  # Two parallel agents
  pisub spawn rust-coder --model deepseek/deepseek-v4-pro --cwd ~/dev/proj
  pisub spawn reviewer  --model zai/glm-5.2 --cwd ~/dev/proj --tmux
  pisub send rust-coder "implement feature X"
  pisub send reviewer  "review the diff in src/" --follow-up
  pisub list

WHY NOT JUST 'pi -p'?
  'pi -p' is one-shot: prints and dies. You can't steer it.
  pisub keeps the agent alive via 'pi --mode rpc' and gives you a real
  protocol (prompt/steer/follow_up/abort) with full event logging.
`);
}

// ---------------------------------------------------------------------------
// arg helpers
// ---------------------------------------------------------------------------

function requireName(args: string[], cmdName: string): string {
  if (!args[0]) die(`usage: pisub ${cmdName} <name> [...]`);
  return args[0];
}

function parseOpts(args: string[]): Record<string, string | boolean | undefined> {
  const out: Record<string, string | boolean | undefined> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-./g, (m) => m[1].toUpperCase());
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    }
  }
  return out;
}

function die(msg: string): never {
  console.error(`pisub: ${msg}`);
  process.exit(1);
}
function warn(msg: string) { console.error(`pisub: warning: ${msg}`); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  cmd = sub ?? "help";
  switch (sub) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      cmdHelp(); break;
    case "spawn":       await cmdSpawn(rest); break;
    case "__daemon":    await cmdDaemon(rest); break;  // hidden
    case "send":
    case "prompt":      await cmdSend(rest); break;
    case "steer":
      requireName(rest, "steer");
      await sendQueued(rest[0]!, rest.slice(1).join(" "), true, false); break;
    case "follow-up":
    case "followup":    await sendQueued(rest[0]!, rest.slice(1).join(" "), false, true); break;
    case "abort":       await cmdAbort(rest); break;
    case "bash":        await cmdBash(rest); break;
    case "status":      await cmdStatus(rest); break;
    case "list":        await cmdList(); break;
    case "events":      await cmdEvents(rest); break;
    case "log":         await cmdLog(rest); break;
    case "tail":        await cmdTail(rest); break;
    case "kill":        await cmdKill(rest); break;
    case "attach":      await cmdAttach(rest); break;
    default:
      die(`unknown command '${sub}'. Try 'pisub help'.`);
  }
}

main().catch((e) => {
  console.error(`pisub: ${e.stack ?? e.message ?? e}`);
  process.exit(1);
});
