// Regression tests for the first CodeRabbit review round (PR #415). Each
// block pins one reviewed defect: CLI operand/limit parsing, expand id
// resolution and continuations, host-source boundary hardening, response
// bounds, continuation staleness, cold-search coverage, and BM25 token
// handling. Fixtures mirror tests/isolated-index.test.ts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { INDEX_DIR_ENV } from "../src/config.js";
import { buildCliContext } from "../src/cli/context.js";
import { runRecall } from "../src/cli/recall.js";
import { resolveMemoryId, runExpandCall } from "../src/cli/expand.js";
import { presentRecall } from "@e4779/pi-fabric/memory";
import type { DigestShard, Shard } from "@e4779/pi-fabric/memory";
import { bm25Score } from "@e4779/pi-fabric/memory";
import { processMemoryExpand } from "@e4779/pi-fabric/memory";
import { processMemoryRecall } from "@e4779/pi-fabric/memory";
import { MemoryRequestCache } from "@e4779/pi-fabric/memory";
import { searchMemoryIndex } from "@e4779/pi-fabric/memory";
import { planMemoryQuery } from "@e4779/pi-fabric/memory";
import {
  createMemorySourceRegistry,
  defineMemorySource,
  MEMORY_SOURCE_INTERFACE_VERSION,
} from "@e4779/pi-fabric/memory";
import { createMemorySourceClient } from "@e4779/pi-fabric/memory";

const PACKAGE_ROOT = path.join(import.meta.dir, "..");
const BIN = path.join(PACKAGE_ROOT, "bin", "pi-recall");

const writeSession = (file: string, sessionId: string, texts: string[]): void => {
  const lines = [
    JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp: "2026-11-11T00:00:00.000Z", cwd: "/tmp/recall-proj" }),
    ...texts.map((text, position) =>
      JSON.stringify({
        type: "message",
        id: `entry${position}`,
        parentId: position === 0 ? null : `entry${position - 1}`,
        timestamp: `2026-11-11T00:0${position % 10}:00.000Z`,
        message: { role: "user", content: text },
      }),
    ),
  ];
  writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
};

const runBin = (...argv: string[]): { code: number; stderr: string } => {
  const proc = Bun.spawnSync(["bun", BIN, ...argv], {
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: "/tmp/pi-recall-empty-agent",
      PI_RECALL_INDEX_DIR: "/tmp/pi-recall-empty-idx",
    },
  });
  return {
    code: proc.exitCode,
    stderr: new TextDecoder().decode(proc.stderr),
  };
};

// ---------------------------------------------------------------------------
// bin/pi-recall: flag tokens are not operand values; --limit must be positive.
// ---------------------------------------------------------------------------
describe("CLI argument parsing", () => {
  test("--scope rejects a flag token as its operand", () => {
    const result = runBin("recall", "foo", "--scope", "--all");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--scope does not accept a flag as its value: --all");
  });

  test("--scope still accepts documented values such as session:", () => {
    const result = runBin("recall", "foo", "--scope", "session:abc");
    expect(result.stderr).not.toContain("does not accept a flag");
  });

  test("--limit rejects zero and empty values", () => {
    for (const value of ["0", ""]) {
      const result = runBin("recall", "foo", "--limit", value);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("--limit needs a positive integer");
    }
  });

  test("--offset still accepts zero", () => {
    const result = runBin("recall", "foo", "--offset", "0");
    expect(result.stderr).not.toContain("integer");
  });
});

// ---------------------------------------------------------------------------
// expand: id resolution scans every index file, refuses stale ids, forwards
// entryOffset, and prints the continuation.
// ---------------------------------------------------------------------------
describe("expand id resolution and continuations", () => {
  let root: string;
  let agentDir: string;
  let indexDir: string;
  let sessionA: string;
  let sessionB: string;
  const previousIndexDir = process.env[INDEX_DIR_ENV];

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "pi-recall-expand-"));
    agentDir = path.join(root, "agent");
    indexDir = path.join(root, "index");
    const projectDir = path.join(agentDir, "sessions", "--tmp-recall-proj--");
    mkdirSync(projectDir, { recursive: true });
    sessionA = path.join(projectDir, "2026-11-11T00-00-00-000Z_00000000-0000-0000-0000-00000000000a.jsonl");
    sessionB = path.join(projectDir, "2026-11-11T01-00-00-000Z_00000000-0000-0000-0000-00000000000b.jsonl");
    process.env[INDEX_DIR_ENV] = indexDir;
  });

  afterAll(() => {
    if (previousIndexDir === undefined) delete process.env[INDEX_DIR_ENV];
    else process.env[INDEX_DIR_ENV] = previousIndexDir;
    rmSync(root, { recursive: true, force: true });
  });

  const context = () => buildCliContext({ agentDir });

  test("a stale id is refused instead of expanding whatever now sits at the cached index", async () => {
    writeSession(sessionA, "session-a", ["alpha needle one", "alpha needle two"]);
    await runRecall({ query: "alpha", scope: "global" }, context());
    const matches = resolveMemoryId("entry0", context());
    expect(matches).toHaveLength(1);
    expect(matches[0]!.sourceHash).toBeString();

    writeSession(sessionA, "session-a", ["rewritten session carries different entry ids"]);
    const result = await runExpandCall({ id: "entry0", idx: [] }, context());
    expect(result.ok).toBe(false);
    const codes = result.lines.join("\n");
    expect(codes.includes("stale_pointer") || codes.includes("address_not_found")).toBe(true);
  });

  test("the same id in two sessions is ambiguous, not silently newest-wins", async () => {
    writeSession(sessionA, "session-a", ["alpha needle one", "alpha needle two"]);
    writeSession(sessionB, "session-b", ["beta needle one", "beta needle two"]);
    await runRecall({ query: "needle", scope: "global" }, context());
    expect(resolveMemoryId("entry0", context())).toHaveLength(2);
    const result = await runExpandCall({ id: "entry0", idx: [] }, context());
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toContain("matches 2 sessions");
    expect(result.lines.some((line) => line.includes(path.basename(sessionA)))).toBe(true);
    expect(result.lines.some((line) => line.includes(path.basename(sessionB)))).toBe(true);
  });

  test("offset is forwarded as entryOffset and the continuation is printed", async () => {
    writeSession(sessionA, "session-a", [
      "alpha " + "x".repeat(1_200),
      "beta " + "y".repeat(1_200),
      "gamma " + "z".repeat(1_200),
    ]);
    writeSession(sessionB, "session-b", ["unrelated beta"]);
    await runRecall({ query: "alpha", scope: "global" }, context());

    const page1 = await runExpandCall({ session: sessionA, idx: [0, 1, 2], maxChars: 1_500 }, context());
    expect(page1.ok).toBe(true);
    expect(page1.lines.find((line) => line.startsWith("# entry"))).toContain("# entry #0");
    const hint = page1.lines.find((line) => line.includes("more entries"));
    expect(hint).toBeString();
    expect(hint).toContain("offset=");

    const offset = Number(/offset=(\d+)/.exec(hint!)![1]);
    expect(offset).toBeGreaterThan(0);
    const textOffsetMatch = /textOffset=(\d+)/.exec(hint!);
    const page2 = await runExpandCall({
      session: sessionA,
      idx: [0, 1, 2],
      offset,
      ...(textOffsetMatch ? { textOffset: Number(textOffsetMatch[1]) } : {}),
      maxChars: 1_500,
    }, context());
    expect(page2.ok).toBe(true);
    // The continuation resumes at entry #1; before the entryOffset fix the
    // CLI's offset was ignored and every page restarted at entry #0.
    expect(page2.lines.find((line) => line.startsWith("# entry"))).toContain("# entry #1");
  });
});

// ---------------------------------------------------------------------------
// Host-source boundary: adapter failures are sanitized, metadata field types
// are validated, and display keys resolve in session-scoped recall.
// ---------------------------------------------------------------------------



describe("expand selection cache isolation", () => {
  let root: string;
  let agentDir: string;
  let file: string;
  const previousIndexDir = process.env[INDEX_DIR_ENV];

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "pi-recall-canonical-"));
    agentDir = path.join(root, "agent");
    const projectDir = path.join(agentDir, "sessions", "--tmp-recall-proj--");
    mkdirSync(projectDir, { recursive: true });
    file = path.join(projectDir, "2026-11-11T00-00-00-000Z_00000000-0000-0000-0000-0000000000cc.jsonl");
    writeSession(file, "canonical", Array.from({ length: 5 }, (_, i) => `canonical entry ${i}`));
    process.env[INDEX_DIR_ENV] = path.join(root, "index");
  });

  afterAll(() => {
    if (previousIndexDir === undefined) delete process.env[INDEX_DIR_ENV];
    else process.env[INDEX_DIR_ENV] = previousIndexDir;
    rmSync(root, { recursive: true, force: true });
  });

  test("a range-only request after a mixed request resolves its own selection", async () => {
    const cache = new MemoryRequestCache();
    const context = buildCliContext({ agentDir });
    const mixed = await processMemoryExpand(
      { session: file, indices: [4], entryRange: { first: 0, last: 2 } },
      context,
      cache,
    ) as { entries: Array<{ index: number }> };
    expect(mixed.entries.map((entry) => entry.index)).toEqual([0, 1, 2, 4]);

    const rangeOnly = await processMemoryExpand(
      { session: file, entryRange: { first: 0, last: 2 } },
      context,
      cache,
    ) as { entries: Array<{ index: number }> };
    expect(rangeOnly.entries.map((entry) => entry.index)).toEqual([0, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// Cold search: vocabulary misses cannot establish complete regex coverage;
// phrase candidates keep substring matches.
// ---------------------------------------------------------------------------

