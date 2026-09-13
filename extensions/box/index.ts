/**
 * pi-box — distrobox integration for pi.
 *
 * Lets the agent run experimental commands inside distrobox containers
 * ("boxes") instead of polluting the host system: package installs,
 * builds, tests, throwaway experiments.
 *
 * Tools:
 *   box_list — parse `distrobox list` into { name, image, status }[]
 *   box_exec — run `distrobox enter <box> -- bash -lc <cmd>` with a timeout
 *
 * Deliberately execution-only: creating and removing boxes is NOT exposed —
 * box lifecycle is a human decision (see skills/box/SKILL.md).
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  truncateTail,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
} from '@earendil-works/pi-coding-agent';
import { Type, type Static } from 'typebox';
import { spawn } from 'node:child_process';

export const DEFAULT_TIMEOUT_SEC = 120;
export const MAX_TIMEOUT_SEC = 3600;

export interface BoxInfo {
  name: string;
  image: string;
  status: string;
}

export interface BoxExecDetails {
  box: string;
  ok: boolean;
  exitCode: number | null;
  output: string;
  timedOut: boolean;
}

interface RunResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  spawnError?: string;
}

// ===========================================================================
// Core: distrobox runner
// ===========================================================================

function clampTimeout(timeoutSec: number | undefined): number {
  const n = Math.floor(timeoutSec ?? DEFAULT_TIMEOUT_SEC);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TIMEOUT_SEC;
  return Math.min(n, MAX_TIMEOUT_SEC);
}

/** Run `distrobox <args>` to completion. Never rejects — failures land in
 *  the result (ok/exitCode/timedOut/spawnError) so tools can report them.
 *
 *  The child is spawned detached as its own process group so killTree()
 *  can SIGKILL the whole local chain. A bare SIGTERM to the top process is
 *  not enough: `distrobox enter` chains through podman exec, `close` then
 *  waits for the container-side command to finish naturally (observed:
 *  `sleep 30` under a 2s timeout returned after 30s). */
export function runDistrobox(
  args: string[],
  timeoutSec: number,
  signal?: AbortSignal,
): Promise<RunResult> {
  return new Promise((resolve) => {
    let timedOut = false;
    let aborted = false;
    let settled = false;

    const child = spawn('distrobox', args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // own process group → killTree() reaches the full chain
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    /** SIGKILL the child's whole process group (distrobox script + podman client). */
    const killTree = () => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
      armFailsafe();
    }, clampTimeout(timeoutSec) * 1000);

    // Failsafe: after a kill, `close` should fire immediately (our stdio
    // pipes die with the process group). If it somehow never does, resolve
    // anyway so a tool call cannot hang forever.
    let failsafe: ReturnType<typeof setTimeout> | null = null;
    function armFailsafe() {
      if (failsafe !== null) return;
      failsafe = setTimeout(() => {
        finish(null);
      }, 10_000);
    }

    const onAbort = () => {
      aborted = true;
      killTree();
      armFailsafe();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    function finish(exitCode: number | null, spawnError?: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (failsafe !== null) clearTimeout(failsafe);
      signal?.removeEventListener('abort', onAbort);
      resolve({
        ok: exitCode === 0 && !timedOut && !aborted && spawnError === undefined,
        exitCode,
        stdout,
        stderr,
        timedOut,
        aborted,
        ...(spawnError !== undefined ? { spawnError } : {}),
      });
    }

    // 'error' = spawn failure (distrobox not installed, EACCES, ...).
    child.on('error', (err: Error) => finish(null, err.message));
    child.on('close', (code: number | null) => {
      finish(timedOut || aborted ? null : code);
    });
  });
}

// ===========================================================================
// Core: `distrobox list` parser
// ===========================================================================

/** Parse `distrobox list` table output into BoxInfo records.
 *  Tolerates column-width drift: splits on '|', skips the header row. */
export function parseDistroboxList(raw: string): BoxInfo[] {
  const boxes: BoxInfo[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^ID\b/i.test(trimmed)) continue; // header: "ID | NAME | STATUS | IMAGE"
    const cells = trimmed.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const name = cells[1];
    if (!name) continue;
    boxes.push({ name, image: cells[3] ?? '', status: cells[2] ?? '' });
  }
  return boxes;
}

// ===========================================================================
// Tools
// ===========================================================================

const boxExecParameters = Type.Object({
  box: Type.String({ description: 'Box name as reported by box_list' }),
  cmd: Type.String({ description: 'Command to run inside the box (executed via `bash -lc`)' }),
  timeoutSec: Type.Optional(
    Type.Number({
      description: `Timeout in seconds (default ${DEFAULT_TIMEOUT_SEC}, max ${MAX_TIMEOUT_SEC})`,
      minimum: 1,
    }),
  ),
});

export type BoxExecInput = Static<typeof boxExecParameters>;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'box_list',
    label: 'Distrobox list',
    description:
      'List distrobox containers. Returns each box as { name, image, status }. ' +
      'Use it to discover available boxes before box_exec.',
    promptSnippet: 'List distrobox containers (name, image, status)',
    promptGuidelines: [
      'Use box_list before box_exec to discover box names and their status.',
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal) {
      const run = await runDistrobox(['list'], DEFAULT_TIMEOUT_SEC, signal);
      if (run.spawnError !== undefined) {
        throw new Error(`box_list: cannot run distrobox: ${run.spawnError}`);
      }
      const boxes = parseDistroboxList(run.stdout);
      if (boxes.length === 0 && run.stderr.trim().length > 0) {
        throw new Error(
          `box_list: distrobox list returned no containers and reported: ${run.stderr.trim()}`,
        );
      }
      const text =
        boxes.length === 0
          ? 'No distrobox containers found. Boxes are created manually, e.g.: distrobox create -n playground -i debian:13'
          : boxes.map((b) => `${b.name}  [${b.status}]  ${b.image}`).join('\n');
      return {
        content: [{ type: 'text', text }],
        details: { boxes },
      };
    },
  });

  pi.registerTool({
    name: 'box_exec',
    label: 'Distrobox exec',
    description:
      'Run a command inside a distrobox container: `distrobox enter <box> -- bash -lc <cmd>`. ' +
      'Use it for experimental work (package installs, builds, tests) to keep the host clean. ' +
      `Times out after timeoutSec (default ${DEFAULT_TIMEOUT_SEC}). Returns { ok, exitCode, output }. ` +
      'Does NOT create or remove boxes — that is a manual operation.',
    promptSnippet: 'Run a command inside a distrobox container (bash -lc)',
    promptGuidelines: [
      'Use box_exec to run package installs, builds and tests inside a distrobox container instead of on the host; check available boxes with box_list first.',
    ],
    parameters: boxExecParameters,
    async execute(_toolCallId, params, signal) {
      const timeoutSec = clampTimeout(params.timeoutSec);
      const run = await runDistrobox(
        ['enter', params.box, '--', 'bash', '-lc', params.cmd],
        timeoutSec,
        signal,
      );
      if (run.spawnError !== undefined) {
        throw new Error(`box_exec: cannot run distrobox: ${run.spawnError}`);
      }

      const combined = [run.stdout, run.stderr]
        .filter((s) => s.trim().length > 0)
        .join('\n')
        .trimEnd();
      const trunc = truncateTail(combined, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });
      let output = trunc.content;
      if (trunc.truncated) {
        output += `\n[box_exec: output truncated, kept last ${trunc.outputLines} of ${trunc.totalLines} lines]`;
      }

      const details: BoxExecDetails = {
        box: params.box,
        ok: run.ok,
        exitCode: run.exitCode,
        output,
        timedOut: run.timedOut,
      };

      if (run.aborted) {
        return {
          content: [{ type: 'text', text: `box_exec: cancelled${output ? `\n${output}` : ''}` }],
          details,
        };
      }

      const statusLine = run.timedOut
        ? `TIMED OUT after ${timeoutSec}s (partial output below; raise timeoutSec or keep long jobs in background inside the box)`
        : `exit ${run.exitCode}`;
      const text = `box ${params.box}: ${run.ok ? 'ok' : 'FAILED'} — ${statusLine}${output ? `\n${output}` : ''}`;

      return {
        content: [{ type: 'text', text }],
        details,
      };
    },
  });
}
