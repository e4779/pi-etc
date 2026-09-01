/**
 * rlm-way lite — stdio NDJSON kernel backend (extensions/rlm-way/kernel.py).
 *
 * For machines where the nteract/runtimed daemon cannot be installed
 * (corporate macOS): zero dependencies beyond python3 itself. The kernel is
 * a plain child process that stays alive for the whole pi session; state
 * persists across calls (not across pi sessions — that needs the daemon).
 * Kernel API (bash/read/edit/write/rlm/mcp) is injected from repl.ts.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { INIT_CELL, logCell, logDbOpen, RLM_TOOLS } from "./repl.js";

const KERNEL_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "kernel.py");

export function pythonAvailable(): string | null {
  const exes =
    process.platform === "win32"
      ? ["python.exe", "python3.exe", "python"]
      : ["python3", "python"];
  for (const exe of exes) {
    for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
      if (!dir) continue;
      const candidate = path.join(dir, exe);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

type CellResponse = {
  ok: boolean;
  stdout: string;
  result: string | null;
  error: string | null;
  n: number;
};

class LineReader {
  private buf = "";
  private lines: string[] = [];
  private pending: ((line: string | null) => void)[] = [];
  constructor(stream: Readable) {
    stream.setEncoding("utf-8");
    stream.on("data", (chunk: string) => {
      this.buf += chunk;
      let idx: number;
      while ((idx = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 1);
        const resolve = this.pending.shift();
        if (resolve) resolve(line);
        else this.lines.push(line);
      }
    });
    const fail = () => {
      for (const resolve of this.pending.splice(0)) resolve(null);
    };
    stream.on("end", fail);
    stream.on("error", fail);
  }
  next(): Promise<string | null> {
    const buffered = this.lines.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    return new Promise((resolve) => this.pending.push(resolve));
  }
}

let child: ChildProcess | null = null;
let reader: LineReader | null = null;
let execCount = 0;
let queue: Promise<unknown> = Promise.resolve();

function spawnKernel(): void {
  const py = pythonAvailable();
  if (!py) throw new Error("rlm-way lite: python not found on PATH");
  child = spawn(py, [KERNEL_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
  });
  child.stderr?.on("data", (d) => console.error("[rlm-lite kernel]", String(d).trim()));
  child.on("exit", () => {
    child = null;
    reader = null;
  });
  reader = new LineReader(child.stdout as Readable);
}

function sleepReject(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

async function waitReady(timeoutMs: number): Promise<void> {
  const line = await Promise.race([reader!.next(), sleepReject(timeoutMs, "kernel start timeout")]);
  if (!line) throw new Error("rlm-way lite: kernel exited during start");
  const msg = JSON.parse(line) as { ready?: boolean };
  if (!msg.ready) throw new Error("rlm-way lite: unexpected first line: " + line);
}

async function rawCell(code: string, timeoutMs: number): Promise<CellResponse> {
  execCount += 1;
  child!.stdin!.write(JSON.stringify({ code, n: execCount }) + "\n");
  const line = await Promise.race([
    reader!.next(),
    sleepReject(
      timeoutMs,
      `cell timeout (${Math.round(timeoutMs / 1000)}s) — kernel killed; state lost, next call starts fresh`,
    ),
  ]);
  if (!line) throw new Error("rlm-way lite: kernel exited (crashed or shut down)");
  return JSON.parse(line) as CellResponse;
}

export function runCellLite(code: string, timeoutMs = 120_000): Promise<CellResponse> {
  const task = queue.then(async () => {
    if (!child || child.exitCode !== null) {
      spawnKernel();
      await waitReady(30_000);
      await rawCell(INIT_CELL, 120_000); // inject kernel API (idempotent)
    }
    try {
      return await rawCell(code, timeoutMs);
    } catch (e) {
      child?.kill(); // stuck or dead: restart on next call
      child = null;
      throw e;
    }
  });
  queue = task.catch(() => {});
  return task as Promise<CellResponse>;
}

const LITE_PARAMS = Type.Object({
  code: Type.String({
    description:
      "Python source to execute in the persistent lite kernel. print() for side effects; the last expression's repr is returned.",
  }),
  dependencies: Type.Optional(
    Type.Array(Type.String(), {
      description: "Packages to pip-install before executing this code (python -m pip install).",
    }),
  ),
  timeout_secs: Type.Optional(
    Type.Number({ description: "Max seconds to wait for execution (default 120).", default: 120 }),
  ),
});

export function lite(pi: ExtensionAPI): void {
  let rlmMode = false;
  let toolsBeforeRlm: string[] | null = null;

  pi.registerTool({
    name: "ipython",
    label: "Python kernel (rlm-way lite)",
    description:
      "Execute Python in the persistent rlm-way lite kernel (plain python3 child process over NDJSON stdio — no daemon required). Variables and imports persist across calls within this pi session. Kernel API pre-injected: bash(cmd) shell, read/write/edit files (edit prints a diff), rlm(prompt) one-shot sub-agent, mcp(server.tool, args) MCP via mcporter.",
    promptSnippet:
      "ipython: persistent Python kernel (lite backend, no daemon). Kernel API: bash/read/edit/write/rlm/mcp. State persists across calls.",
    parameters: LITE_PARAMS,
    async execute(_toolCallId, params, signal) {
      if (signal?.aborted) throw new Error("aborted");
      const timeoutSecs = Math.max(1, params.timeout_secs ?? 120);
      if (params.dependencies?.length) {
        const arr = JSON.stringify(params.dependencies);
        await runCellLite(
          `import json as _j, subprocess as _sp, sys as _s
` +
            `_r = _sp.run([_s.executable, "-m", "pip", "install", *_j.loads(r"""${arr}""")], capture_output=True, text=True)
` +
            `print(_r.stdout or _r.stderr)`,
          600_000,
        );
      }
      const res = await runCellLite(params.code, timeoutSecs * 1000);
      const parts: string[] = [];
      if (res.stdout) parts.push(res.stdout.replace(/\n+$/, ""));
      if (res.result != null) parts.push(`Out[${res.n}]: ${res.result}`);
      if (!res.ok && res.error) parts.push(res.error);
      logCell("lite-kernel", res.n, res.ok ? "done" : "error", params.code);
      return {
        content: [{ type: "text", text: parts.join("\n") || "(no output)" }],
        details: {
          backend: "lite",
          exec_count: res.n,
          status: res.ok ? "done" : "error",
          is_error: !res.ok,
        },
      };
    },
  });

  pi.registerCommand("ipython-reset", {
    description: "Kill the lite kernel; next ipython call starts a fresh one",
    handler: async (_args, ctx) => {
      try {
        child?.stdin?.write('{"op": "shutdown"}\n');
      } catch {}
      setTimeout(() => child?.kill(), 300);
      child = null;
      execCount = 0;
      ctx.ui.notify("Lite kernel closed. Next ipython call starts fresh.", "info");
    },
  });

  pi.registerCommand("rlm", {
    description: "Toggle RLM mode: single-tool (ipython kernel API only)",
    handler: async (_args, ctx) => {
      if (!rlmMode) {
        toolsBeforeRlm = pi.getActiveTools();
        pi.setActiveTools(RLM_TOOLS);
        rlmMode = true;
        ctx.ui.notify(
          `RLM mode ON — tools: ${RLM_TOOLS.join(", ")}. Kernel API: bash() read() edit() write() rlm() mcp()`,
          "info",
        );
      } else {
        pi.setActiveTools(toolsBeforeRlm ?? []);
        toolsBeforeRlm = null;
        rlmMode = false;
        ctx.ui.notify("RLM mode OFF — tools restored", "info");
      }
    },
  });

  pi.registerCommand("rlm-log", {
    description: "Tail the rlm-way action log (last kernel cells, SQLite)",
    handler: async (_args, ctx) => {
      const db = logDbOpen();
      if (!db) {
        ctx.ui.notify("Action log unavailable (node:sqlite failed)", "warning");
        return;
      }
      try {
        const rows = db
          .prepare("SELECT ts, exec_count, status, code FROM cells ORDER BY id DESC LIMIT 15")
          .all() as Array<{ ts: string; exec_count: number; status: string; code: string }>;
        const lines = rows.map(
          (r) => `[${r.ts}] #${r.exec_count} ${r.status} :: ${r.code.replace(/\n/g, " ⏎ ").slice(0, 120)}`,
        );
        ctx.ui.notify(lines.length ? lines.join("\n") : "(log is empty)", "info");
      } catch (e) {
        ctx.ui.notify("log read failed: " + (e as Error).message, "warning");
      }
    },
  });

  pi.on("session_shutdown", async () => {
    try {
      child?.stdin?.write('{"op": "shutdown"}\n');
    } catch {}
    setTimeout(() => child?.kill(), 500);
    child = null;
  });
}
