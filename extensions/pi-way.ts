/**
 * pi-way extension — injects pi-way principles into the system prompt.
 *
 * Fabric-aware: under pi-fabric full-code mode NOTHING is injected. Every
 * classic principle is covered natively — context economy and batching by
 * Fabric's own guidance, delegation by agents.run()/workflow helpers,
 * background processes by the windows-preferences skill. The file-tracking
 * style (PLAN.md/TODO.md) is user-directed on purpose. The classic block is
 * kept verbatim for sessions without Fabric; see skills/pi-way/SKILL.md for
 * the full classic→Fabric mapping table.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFabricFullCode } from "./lib/fabric-detect.js";

const PI_WAY_PRINCIPLES = `## Pi-way principles

- **Context is precious.** Progressive disclosure — load details only on demand.
- **Observability.** Write plans, todos, tracking to files (PLAN.md, TODO.md). User sees everything.
- **Explore your tools.** You have mcporter CLI (\`mcporter list\`, \`mcporter call <server>.<tool>\`), Agent (sub-agents), extension tools. Use \`mcporter list <server> --schema\` to see tool schemas before calling.
- **Sub-agents: pick by steereability.** One-shot delegation → \`pisub run\` (or \`Agent\` tool — both work). Long-running / parallel / steerable → \`pisub spawn\` + \`send\`/\`steer\`. NEVER spawn \`pi -p\` in tmux expecting to steer it — it's one-shot (prints and dies). Read the pisub skill before first use.
- **Make is your orchestrator.** Data flows through recipes — make tracks dependencies, only stale tasks re-run.
- **tmux for background processes.** Dev servers, watch mode — not hidden background bash.
- **No MCP dumps.** CLI tools + README-driven discovery. mcporter for MCP when needed.`;

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const cwd =
      (event as { systemPromptOptions?: { cwd?: string } })?.systemPromptOptions?.cwd ??
      (ctx as { cwd?: string })?.cwd ??
      process.cwd();

    // Fabric full-code mode: everything this block would say is already said
    // by Fabric's guidance, the windows-preferences skill, or is user-directed.
    if (isFabricFullCode(cwd)) return;

    return {
      systemPrompt: event.systemPrompt + "\n\n" + PI_WAY_PRINCIPLES,
    };
  });
}
