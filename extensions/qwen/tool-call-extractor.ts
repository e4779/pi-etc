/**
 * Extract tool calls embedded as XML text inside thinking blocks.
 *
 * Qwen Coder models sometimes encode tool calls in XML format inside
 * <thinking> blocks instead of as proper JSON tool_use content blocks:
 *
 *   <function=bash>
 *   <parameter=command>ls -la</parameter>
 *   </function>
 *
 * This module parses that format and produces proper toolCall content
 * blocks that pi's agent loop understands.
 *
 * Also handles the alternative nested format:
 *
 *   <tool_call>
 *   <function=edit>
 *   <parameter=file_path>/path/to/file</parameter>
 *   <parameter=old_string>...</parameter>
 *   <parameter=new_string>...</parameter>
 *   </function>
 *   </tool_call>
 */

export interface ExtractedToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

let callCounter = 0;

function generateToolId(): string {
  callCounter++;
  return `tc_qwen_${callCounter}`;
}

// Match <function=name>...</function> blocks
const functionRegex = /<function=(\w+)>([\s\S]*?)<\/function>/g;

// Match <parameter=name>value</parameter> inside function blocks
const parameterRegex = /<parameter=(\w+)>([\s\S]*?)<\/parameter>/g;

/**
 * Parse thinking text and extract tool calls in Qwen XML format.
 */
export function extractToolCallsFromThinking(thinking: string): ExtractedToolCall[] {
  const results: ExtractedToolCall[] = [];

  functionRegex.lastIndex = 0;

  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: intentional regex loop
  while ((m = functionRegex.exec(thinking)) !== null) {
    const name = m[1];
    const inner = m[2];
    const args: Record<string, unknown> = {};

    parameterRegex.lastIndex = 0;

    let pm: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: intentional regex loop
    while ((pm = parameterRegex.exec(inner)) !== null) {
      const val = pm[2].trim();
      if (val === "true") args[pm[1]] = true;
      else if (val === "false") args[pm[1]] = false;
      else if (/^-?\d+$/.test(val)) args[pm[1]] = parseInt(val, 10);
      else args[pm[1]] = val;
    }

    // Try to parse JSON values (for object/array parameters)
    for (const [k, v] of Object.entries(args)) {
      if (typeof v === "string" && (v.startsWith("{") || v.startsWith("["))) {
        try {
          args[k] = JSON.parse(v);
        } catch {
          /* keep as string */
        }
      }
    }

    results.push({ type: "toolCall", id: generateToolId(), name, arguments: args });
  }

  return results;
}

/**
 * Extract tool calls from all thinking blocks in an assistant message's content,
 * returning a new content array with tool calls appended after their thinking blocks.
 * Returns undefined if no tool calls were found.
 */
export function extractToolCallsFromMessage(
  content: Array<{ type: string; [key: string]: unknown }>,
): Array<{ type: string; [key: string]: unknown }> | undefined {
  let hasExtracted = false;

  for (const block of content) {
    if (block.type === "thinking" && typeof block.thinking === "string") {
      const toolCalls = extractToolCallsFromThinking(block.thinking);
      if (toolCalls.length > 0) {
        hasExtracted = true;
        break;
      }
    }
  }

  if (!hasExtracted) return undefined;

  // Build new content array with tool calls inserted after their thinking blocks
  const newContent: Array<{ type: string; [key: string]: unknown }> = [];
  for (const block of content) {
    newContent.push(block);
    if (block.type === "thinking" && typeof block.thinking === "string") {
      const toolCalls = extractToolCallsFromThinking(block.thinking);
      for (const tc of toolCalls) {
        newContent.push({
          type: "toolCall",
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        });
      }
    }
  }

  return newContent;
}
