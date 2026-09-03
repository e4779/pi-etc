import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";

// pi-coding-agent does not re-export MessageEndEvent from its root entry
// (internal types live under dist/core/extensions/types.ts which is not in
// package.json `exports`). Derive it from the ExtensionEvent union instead.
type MessageEndEvent = Extract<ExtensionEvent, { type: "message_end" }>;
import { getCoreSystemPrompt } from "./system-prompt.js";
import { createEditToolDefinition } from "./edit-qwen.js";
import { extractToolCallsFromMessage } from "./tool-call-extractor.js";
import { getQwenFabricAddendum } from "./fabric-addendum.js";
import { isFabricFullCode } from "../lib/fabric-detect.js";
import { execSync } from "node:child_process";

/**
 * Pi-qwen extension: adapts Qwen models to pi + Fabric.
 *
 * Two modes, selected automatically:
 *
 * 1. Fabric full-code mode (pi-fabric package active, fullCodeMode !== false):
 *    fabric_exec is the only tool, so the legacy edit-tool override and the
 *    full Qwen Code prompt swap are counterproductive. Instead, a compact
 *    behavioral addendum is APPENDED to the chained system prompt (Fabric's
 *    tool contract stays authoritative).
 *
 * 2. Legacy mode (no Fabric / orchestration-only): the original behavior —
 *    full Qwen Code system prompt + Qwen-style edit tool override.
 *
 * The message_end extractor (XML tool calls hidden in <thinking>) runs in
 * both modes; under Fabric it rarely fires, but it is the only safety net
 * when the model fails to emit a proper tool_use block at all.
 */
export default function (pi: ExtensionAPI) {
  // ---- State ----
  let qwenEnabled = false;
  let legacyEditRegistered = false;
  // Fabric full-code detection: ../lib/fabric-detect.ts

  // ---- Hook: session_start (remind about /qwen-flavor for Qwen models) ----
  pi.on("session_start", async (event, ctx) => {
    // Show on startup, new session, and session resume
    if (event.reason !== "startup" && event.reason !== "new" && event.reason !== "resume") return;

    const modelId = ctx.model?.id ?? "";
    if (!/qwen/i.test(modelId)) return;
    if (qwenEnabled) return;

    const cwd = (ctx as { cwd?: string }).cwd ?? process.cwd();
    const fabricMode = isFabricFullCode(cwd);

    const enable = await ctx.ui.confirm(
      "Qwen model detected",
      fabricMode
        ? "You're using a Qwen model with Fabric in full-code mode.\n\nFabric already fixes the edit-format and tool-call issues qwen-flavor was built for. What remains useful is the light behavioral addendum (no early stopping, faithful reporting, scope discipline, retry-from-error).\n\nEnable the Qwen addendum?"
        : "You're using a Qwen model without /qwen-flavor.\n\nWithout qwen-flavor, the edit tool uses pi's native format (oldText/newText) which Qwen models often get wrong. Enable qwen-flavor?",
    );

    if (enable) {
      qwenEnabled = true;
      ctx.ui.setStatus("qwen-flavor", "🔹 qwen-flavor");
      ctx.ui.notify(
        fabricMode
          ? "Qwen addendum enabled ✓ (Fabric full-code mode)"
          : "Qwen flavor enabled ✓",
        "info",
      );
    } else {
      ctx.ui.notify(
        fabricMode
          ? "Type /qwen-flavor anytime to enable the behavioral addendum."
          : "⚠️ Qwen model without qwen-flavor. Type /qwen-flavor if edit tool fails.",
        fabricMode ? "info" : "warning",
      );
    }
  });

  // ---- Command: /qwen-flavor ----
  pi.registerCommand("qwen-flavor", {
    description: "Toggle Qwen Code adaptation (addendum under Fabric, full flavor otherwise)",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: async (_args: any, ctx: any) => {
      qwenEnabled = !qwenEnabled;

      if (qwenEnabled) {
        ctx.ui.setStatus("qwen-flavor", "🔹 qwen-flavor");

        const modelId = ctx.model?.id ?? "";
        const isQwenModel = /qwen/i.test(modelId);
        const cwd = ctx.cwd ?? process.cwd();
        const mode = isFabricFullCode(cwd) ? "addendum (Fabric full-code)" : "full Qwen Code flavor";

        if (!isQwenModel) {
          ctx.ui.notify(
            `Qwen flavor enabled ⚠️ (model: ${modelId} — might not match Qwen training; mode: ${mode})`,
            "warning",
          );
        } else {
          ctx.ui.notify(`Qwen flavor enabled ✓ (${modelId}; mode: ${mode})`, "info");
        }
      } else {
        ctx.ui.setStatus("qwen-flavor", undefined);
        ctx.ui.notify("Qwen flavor disabled ✓", "info");
      }
    },
  });

  // ---- Hook: message_end (extract tool calls from thinking blocks) ----
  // Qwen models sometimes encode tool calls as XML inside <thinking> blocks
  // instead of proper JSON tool_use content blocks. This handler extracts them.
  // Mode-agnostic safety net: under Fabric it rarely fires, but it is the only
  // rescue when the model fails to emit a proper tool_use block at all.
  pi.on("message_end", async (event: MessageEndEvent, _ctx: ExtensionContext) => {
    if (event.message.role !== "assistant") return;

    const content = event.message.content;
    if (!Array.isArray(content)) return;

    // extractToolCallsFromMessage works on a generic content-block shape.
    // The pi SDK types each block as a discriminated union (TextContent |
    // ThinkingContent | ToolCall); cast through unknown to the generic shape
    // the helper expects rather than touching ToolCall's narrower fields.
    const newContent = extractToolCallsFromMessage(
      content as unknown as Array<{ type: string; [key: string]: unknown }>,
    );

    if (newContent) {
      // eslint-disable-next-line no-console
      console.log(
        `[pi-qwen] extracted ${newContent.length - content.length} tool call(s) from thinking`,
      );
      // Cast back through unknown: we replaced the content array with
      // structurally-compatible blocks, but TS only knows the helper's generic
      // output shape, not the pi AgentMessage['content'] union. This matches
      // what pi's MessageEndEventResult.message expects.
      return { message: { ...event.message, content: newContent as unknown as typeof content } };
    }
  });

  // ---- Hook: before_agent_start ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pi.on("before_agent_start", async (event: any, ctx: ExtensionContext) => {
    if (!qwenEnabled) {
      // Return nothing — keep pi's default prompt
      return;
    }

    const modelId = ctx.model?.id ?? (event as { model?: { id?: string } })?.model?.id ?? "unknown";
    const cwd =
      (event as { systemPromptOptions?: { cwd?: string } })?.systemPromptOptions?.cwd ??
      (ctx as { cwd?: string }).cwd ??
      process.cwd();

    if (isFabricFullCode(cwd)) {
      // Fabric full-code mode: APPEND the behavioral addendum to the chained
      // prompt. Never replace — Fabric's session guidance (single fabric_exec
      // tool, pi.* inside code) must stay authoritative, and Fabric appends
      // its own section after ours either way. No edit-tool override: the
      // built-in pi.edit already normalizes Qwen-style field spellings
      // (old_string/new_string, file_path, ...) and a same-name override
      // would only narrow that surface.
      return {
        systemPrompt: event.systemPrompt + "\n\n" + getQwenFabricAddendum(),
      };
    }

    // ---- Legacy mode (no Fabric / orchestration-only): original behavior ----

    // Check if this is a git repo
    let isGitRepo = false;
    try {
      execSync("git rev-parse --is-inside-work-tree", {
        cwd,
        stdio: "ignore",
      });
      isGitRepo = true;
    } catch {
      // not a git repo
    }

    // Build Qwen system prompt
    const qwenPrompt = getCoreSystemPrompt(undefined, modelId, undefined, isGitRepo);

    // Register custom edit tool (Qwen Code style) with name "edit".
    // Register once per session; pi has no unregister API, so the override
    // persists until restart even after toggling off (same as before).
    if (!legacyEditRegistered) {
      pi.registerTool(createEditToolDefinition(cwd));
      legacyEditRegistered = true;
    }

    // Re-set active tools to ensure our custom edit is used
    // Filter out any duplicate 'edit' entries
    const activeTools = pi.getActiveTools();
    const toolsWithoutEdit = activeTools.filter((name: string) => name !== "edit");
    pi.setActiveTools([...toolsWithoutEdit, "edit"]);

    // Return the system prompt override
    return {
      systemPrompt: qwenPrompt,
    };
  });
}
