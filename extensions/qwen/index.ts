import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";

// pi-coding-agent does not re-export MessageEndEvent from its root entry
// (internal types live under dist/core/extensions/types.ts which is not in
// package.json `exports`). Derive it from the ExtensionEvent union instead.
type MessageEndEvent = Extract<ExtensionEvent, { type: "message_end" }>;
import { getCoreSystemPrompt } from "./system-prompt.js";
import { createEditToolDefinition } from "./edit-qwen.js";
import { extractToolCallsFromMessage } from "./tool-call-extractor.js";
import { execSync } from "node:child_process";

/**
 * Pi-qwen extension: replaces the pi system prompt with Qwen Code's
 * system prompt and activates the Qwen-style edit tool when /qwen is toggled on.
 */
export default function (pi: ExtensionAPI) {
  // ---- State ----
  let qwenEnabled = false;

  // ---- Hook: session_start (remind about /qwen-flavor for Qwen models) ----
  pi.on("session_start", async (event, ctx) => {
    // Show on startup, new session, and session resume
    if (event.reason !== "startup" && event.reason !== "new" && event.reason !== "resume") return;

    const modelId = ctx.model?.id ?? "";
    if (!/qwen/i.test(modelId)) return;
    if (qwenEnabled) return;

    const enable = await ctx.ui.confirm(
      "Qwen model detected",
      "You're using a Qwen model without /qwen-flavor.\n\nWithout qwen-flavor, the edit tool uses pi's native format (oldText/newText)\nwhich Qwen models often get wrong. Enable qwen-flavor?",
    );

    if (enable) {
      qwenEnabled = true;
      ctx.ui.setStatus("qwen-flavor", "🔹 qwen-flavor");
      ctx.ui.notify("Qwen flavor enabled ✓", "info");
    } else {
      ctx.ui.notify(
        "⚠️ Qwen model without qwen-flavor. Type /qwen-flavor if edit tool fails.",
        "warning",
      );
    }
  });

  // ---- Command: /qwen ----
  pi.registerCommand("qwen-flavor", {
    description: "Toggle Qwen Code system prompt and edit tool",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: async (_args: any, ctx: any) => {
      qwenEnabled = !qwenEnabled;

      if (qwenEnabled) {
        // Set footer status indicator
        ctx.ui.setStatus("qwen-flavor", "🔹 qwen-flavor");

        // Warn if not using a qwen model
        const modelId = ctx.model?.id ?? "";
        const isQwenModel = /qwen/i.test(modelId);
        if (!isQwenModel) {
          ctx.ui.notify(
            `Qwen flavour enabled ⚠️ (model: ${modelId} — might not match Qwen training)`,
            "warning",
          );
        } else {
          ctx.ui.notify(`Qwen flavor enabled ✓ (${modelId})`, "info");
        }
      } else {
        // Clear footer status indicator
        ctx.ui.setStatus("qwen-flavor", undefined);
        ctx.ui.notify("Qwen flavor disabled ✓", "info");
      }
    },
  });

  // ---- Hook: message_end (extract tool calls from thinking blocks) ----
  // Qwen models sometimes encode tool calls as XML inside <thinking> blocks
  // instead of proper JSON tool_use content blocks. This handler extracts them.
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
  pi.on("before_agent_start", async (_ctx: any) => {
    if (!qwenEnabled) {
      // Return nothing — keep pi's default prompt
      return;
    }

    // Get current model
    const modelId = _ctx.model?.id ?? "unknown";

    // Check if this is a git repo
    let isGitRepo = false;
    try {
      execSync("git rev-parse --is-inside-work-tree", {
        cwd: _ctx.cwd,
        stdio: "ignore",
      });
      isGitRepo = true;
    } catch {
      // not a git repo
    }

    // Build Qwen system prompt
    const qwenPrompt = getCoreSystemPrompt(undefined, modelId, undefined, isGitRepo);

    // Get current active tools
    const activeTools = pi.getActiveTools();

    // Register custom edit tool (Qwen Code style) with name "edit"
    // This should override the built-in edit tool
    const editTool = createEditToolDefinition(_ctx.cwd);
    pi.registerTool(editTool);

    // Re-set active tools to ensure our custom edit is used
    // Filter out any duplicate 'edit' entries
    const toolsWithoutEdit = activeTools.filter((name: string) => name !== "edit");
    const finalTools = [...toolsWithoutEdit, "edit"];
    pi.setActiveTools(finalTools);

    // Return the system prompt override
    return {
      systemPrompt: qwenPrompt,
    };
  });
}
