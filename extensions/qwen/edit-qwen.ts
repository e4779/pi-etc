import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { renderDiff } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { createPatch } from "diff";
import { Box, Spacer, Text } from "@earendil-works/pi-tui";

// 1. Схема параметров (Qwen Code format)
const editSchema = Type.Object({
  file_path: Type.String({
    description: "The absolute path to the file to modify. Must start with '/'.",
  }),
  old_string: Type.String({
    description:
      "The exact literal text to replace, preferably unescaped. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string is not the exact literal text or does not match exactly, the tool will fail.",
  }),
  new_string: Type.String({
    description:
      "The exact literal text to replace `old_string` with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic.",
  }),
  replace_all: Type.Optional(
    Type.Boolean({
      description:
        "Replace all occurrences of old_string (default false).",
    })
  ),
});

// 2. Утилиты для замены
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeLiteralReplace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean
): { success: boolean; result?: string; error?: string; count?: number } {
  if (oldString === "") {
    return { success: false, error: "old_string cannot be empty" };
  }

  const escapedOld = escapeRegExp(oldString);
  const regex = new RegExp(escapedOld, replaceAll ? "g" : "");
  const matches = content.match(regex);
  const count = matches ? matches.length : 0;

  if (count === 0) {
    return {
      success: false,
      error: `Could not find the string to replace. No occurrences of old_string found in file.`,
    };
  }

  if (!replaceAll && count > 1) {
    return {
      success: false,
      error: `Found ${count} occurrences of old_string. Use replace_all: true to replace all of them, or provide more context to make it unique.`,
    };
  }

  return { success: true, result: content.replace(regex, newString), count };
}

// 3. Генерация diff — формат для renderDiff: prefix+lineNum+content
function generateDiff(
  oldContent: string,
  newContent: string
): string {
  const fullDiff = createPatch("file", oldContent, newContent, "Current", "Proposed", {
    context: 3,
  });

  const lines = fullDiff.split("\n");
  const result: string[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of lines) {
    // Start collecting from @@ line onwards
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    // Skip everything before @@ (Index:, ===, --- file Current, +++ file Proposed)
    if (!inHunk) continue;
    // Skip empty trailing lines
    if (line === "") continue;

    if (line.startsWith("-")) {
      oldLine++;
      result.push(`-${oldLine} ${line.slice(1)}`);
    } else if (line.startsWith("+")) {
      newLine++;
      result.push(`+${newLine} ${line.slice(1)}`);
    } else if (line.startsWith(" ")) {
      oldLine++;
      newLine++;
      result.push(` ${oldLine} ${line.slice(1)}`);
    }
  }
  return result.join("\n");
}

// 4. Основная функция createEditToolDefinition
export function createEditToolDefinition(cwd: string): ToolDefinition<typeof editSchema, { diff: string } | undefined> {
  return {
    name: "edit",
    label: "edit",
    description: "Replaces text within a file. By default, replaces a single occurrence. Set `replace_all` to true when you intend to modify every instance of `old_string`.",
    promptSnippet: "Replace text in files with exact match",
    promptGuidelines: [
      "Always use the 'read' tool to examine the file's current content before attempting a text replacement",
      "Include at least 3 lines of context BEFORE and AFTER the target text",
      "Ensure old_string matches exactly",
      "Set `replace_all` to true when you want to replace every occurrence that matches `old_string`",
    ],
    parameters: editSchema,

    // 4.1 Execute
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      let filePath = params.file_path;
      if (!isAbsolute(filePath)) {
        filePath = resolve(cwd, filePath);
      }

      if (!existsSync(filePath)) {
        return {
          content: [{ type: "text" as const, text: `File not found: ${filePath}. Use an empty old_string to create a new file.` }],
          details: undefined,
        };
      }

      let currentContent: string;
      try {
        currentContent = readFileSync(filePath, "utf-8");
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Failed to read file: ${error instanceof Error ? error.message : String(error)}` }],
          details: undefined,
        };
      }

      const result = safeLiteralReplace(
        currentContent,
        params.old_string,
        params.new_string,
        params.replace_all ?? false
      );

      if (!result.success) {
        return {
          content: [{ type: "text" as const, text: result.error || "Unknown error occurred" }],
          details: undefined,
        };
      }

      const diff = generateDiff(currentContent, result.result!);

      try {
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(filePath, result.result!, "utf-8");
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Failed to write file: ${error instanceof Error ? error.message : String(error)}` }],
          details: undefined,
        };
      }

      return {
        content: [{ type: "text" as const, text: `Successfully edited ${filePath}.${result.count && result.count > 1 ? ` Replaced ${result.count} occurrences.` : ""}` }],
        details: { diff },
      };
    },

    // 4.2 renderCall — пустой, header только в renderResult
    renderCall(_args, _theme, _context) {
      return new Text("", 0, 0);
    },

    // 4.3 renderResult — header + diff в цветном Box
    renderResult(result, _options, theme, context) {
      const filePath = context.args?.file_path || "...";
      const header = `${theme.fg("toolTitle", theme.bold("edit"))} ${filePath}`;

      // Если нет diff (ошибка), покажем текст на красном фоне
      if (!result.details?.diff) {
        const content = Array.isArray(result.content)
          ? (result.content as { type: string; text: string }[]).map((c) => c.text).join("\n")
          : "";
        const box = new Box(1, 1, (text: string) => theme.bg("toolErrorBg", text));
        box.addChild(new Text(header, 0, 0));
        box.addChild(new Spacer(1));
        box.addChild(new Text(theme.fg("error", content), 1, 0));
        return box;
      }

      // Форматируем diff с inline подсветкой и показываем на зелёном фоне
      const diffOutput = renderDiff(result.details.diff);
      const box = new Box(1, 1, (text: string) => theme.bg("toolSuccessBg", text));
      box.addChild(new Text(header, 0, 0));
      box.addChild(new Spacer(1));
      box.addChild(new Text(diffOutput, 1, 0));
      return box;
    },
  };
}
