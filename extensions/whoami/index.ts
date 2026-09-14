import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";

/**
 * whoami — inject model identity into the system prompt.
 *
 * pi's built-in prompt says "You are an expert coding assistant operating
 * inside pi" but never names the model. Models served through an API often
 * misidentify themselves (GLM claiming to be ChatGPT, etc.). Every mature
 * harness injects identity natively — Claude Code and ZCode do it via
 * "You are powered by the model named X"; OpenCode does it in
 * session/system.ts. As of 2026-09 no pi extension does it (verified by
 * surveying narumiruna/pi-extensions, ogulcancelik/pi-extensions,
 * nicobailon/* and npm). This extension fills that gap.
 *
 * Appends (never replaces) a compact "Model Identity" section at
 * before_agent_start — the sanctioned append point per pi docs. Idempotent:
 * skips if the marker is already present (retry/compaction re-runs).
 */

type BeforeAgentStartEvent = Extract<ExtensionEvent, { type: "before_agent_start" }>;

const MARKER = "## Model Identity";

interface ModelProfile {
  /** Human-readable name shown to the model. */
  name: string;
  /** Short, actionable strengths — what to lean into. */
  strengths: string[];
}

/** Curated profiles for the fleet we actually run. Unknown models get identity-only. */
const PROFILES: Array<{ match: RegExp; profile: ModelProfile }> = [
  {
    match: /glm-5\.3-flash/i,
    profile: {
      name: "GLM-5.3-Flash",
      strengths: [
        "fast, token-efficient workhorse: everyday coding, large codebases, high-volume agent loops",
        "natively multimodal (text + image): UI screenshots, visual verification",
        "1M-token context",
      ],
    },
  },
  {
    match: /glm-5\.3$/i,
    profile: {
      name: "GLM-5.3",
      strengths: [
        "flagship coding and long-horizon reasoning: hardest tasks, multi-step agent work, security research",
        "1M-token context",
      ],
    },
  },
  {
    match: /glm-4\.6v-flash/i,
    profile: {
      name: "GLM-4.6V-Flash (free tier)",
      strengths: ["free vision model: image understanding, screenshot triage", "128K context, 16K output"],
    },
  },
  {
    match: /glm-4\.5-flash/i,
    profile: {
      name: "GLM-4.5-Flash (free tier)",
      strengths: ["free tier: light edits, classification, bulk background work — do not use for hard reasoning"],
    },
  },
  {
    match: /glm-5\.1|glm-4\.7/i,
    profile: { name: "GLM (previous generation)", strengths: ["capable general coding model; server-side auto-routing sends 5.1/4.7 traffic to glm-5.3/flash"] },
  },
  {
    match: /GigaChat3\.5-432B/i,
    profile: {
      name: "GigaChat 3.5 432B (Cloud.ru)",
      strengths: ["strong Russian-language and RU-domain handling", "fast interactive responses", "no native reasoning traces — keep reasoning external/incremental"],
    },
  },
  {
    match: /deepseek-v4/i,
    profile: {
      name: "DeepSeek V4",
      strengths: ["strong reasoning; brief instructions work, structure optional"],
    },
  },
  {
    match: /qwen/i,
    profile: {
      name: "Qwen",
      strengths: ["capable but prompt-sensitive: needs maximally explicit structured prompts with examples"],
    },
  },
];

function buildIdentitySection(modelId: string, displayName: string | undefined, provider: string | undefined): string {
  const profile = PROFILES.find((p) => p.match.test(modelId))?.profile;
  const fq = `${provider ? provider + "/" : ""}${modelId}`;
  const lines = [
    MARKER,
    `- You are powered by the model \`${fq}\`${profile ? ` (${profile.name})` : displayName ? ` (${displayName})` : ""}.`,
  ];
  if (profile) {
    lines.push(`- Your strengths — lean into them: ${profile.strengths.join("; ")}.`);
  }
  lines.push(
    "- When asked which model or product you are, answer from this section. Never claim to be a different model, company, or product."
  );
  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    const systemPrompt = (event as { systemPrompt?: string }).systemPrompt;
    if (typeof systemPrompt !== "string") return;
    if (systemPrompt.includes(MARKER)) return; // idempotent across retries/compaction

    const model = ctx.model ?? (event as { model?: { id?: string; provider?: string; name?: string } }).model;
    const modelId = model?.id ?? "";
    if (!modelId) return;

    const provider = (model as { provider?: string }).provider ?? "";
    const displayName = (model as { name?: string }).name ?? undefined;

    (event as { systemPrompt: string }).systemPrompt =
      systemPrompt + "\n\n" + buildIdentitySection(modelId, displayName, provider);
    return;
  });
}
