import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * inject-default-skills — always-on skills for every session.
 *
 * pi loads skills with progressive disclosure: only names + descriptions enter
 * the system prompt, full SKILL.md content loads on demand — and the docs
 * admit "models don't always do this". There is no `always: true` frontmatter
 * (verified against docs/skills.md, 2026-09-21) and no ready-made extension
 * for it (verified: npm keywords:pi-package, narumiruna/pi-extensions,
 * nicobailon/*, GitHub code search for before_agent_start injectors).
 *
 * This extension closes the gap: it appends the full content of configured
 * SKILL.md files to the system prompt at before_agent_start (the sanctioned
 * append point, same as whoami). Config: ~/.pi/agent/default-skills.json —
 * a JSON array of { "path": string, "note"?: string }. Paths may use ~.
 * Reload trigger: /reload or session restart; content refreshes automatically
 * when files or config change (mtime-keyed cache, checked per turn).
 */

const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "default-skills.json");

interface SkillRef {
	path: string;
	note?: string;
}

const expandHome = (p: string): string =>
	p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;

export default function (pi: ExtensionAPI) {
	let cacheKey = "";
	let cachedBlock = "";

	const buildBlock = (): { key: string; block: string } => {
		let refs: SkillRef[] = [];
		const statKeys: string[] = [];
		try {
			statKeys.push(fs.statSync(CONFIG_PATH).mtimeMs.toString());
			const parsed: unknown = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
			refs = Array.isArray(parsed) ? (parsed as SkillRef[]) : [];
		} catch {
			return { key: "no-config", block: "" };
		}
		const parts: string[] = [];
		for (const ref of refs) {
			if (!ref || typeof ref.path !== "string") continue;
			const file = expandHome(ref.path);
			try {
				statKeys.push(`${file}:${fs.statSync(file).mtimeMs}`);
				const name = path.basename(path.dirname(file));
				parts.push(`### Skill: ${name}${ref.note ? ` — ${ref.note}` : ""}\n\n${fs.readFileSync(file, "utf8").trim()}`);
			} catch {
				statKeys.push(`${file}:missing`);
			}
		}
		return { key: statKeys.join("|"), block: parts.join("\n\n---\n\n") };
	};

	pi.on("before_agent_start", async (event) => {
		const fresh = buildBlock();
		if (fresh.key !== cacheKey) {
			cacheKey = fresh.key;
			cachedBlock = fresh.block;
		}
		if (!cachedBlock) return undefined;
		const header = "# Auto-loaded skills (inject-default-skills)\n\nThe following skill instructions are injected every turn; treat them as active operating instructions.";
		return { systemPrompt: `${event.systemPrompt}\n\n${header}\n\n${cachedBlock}` };
	});
}
