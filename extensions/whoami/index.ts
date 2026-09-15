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
 * Appends a compact "Model Identity" section at before_agent_start — the
 * sanctioned append point per pi docs. Idempotent per-model: skips if the
 * current model's section is already present (retry/compaction); replaces a
 * stale section when the model changes mid-session via /model.
 */

type BeforeAgentStartEvent = Extract<ExtensionEvent, { type: "before_agent_start" }>;

const MARKER = "## Model Identity";
/** Last line of every identity section — used to find the section boundary for replacement. */
const SECTION_END =
  "- When asked which model or product you are, answer from this section. Never claim to be a different model, company, or product.";

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
      ],
    },
  },
  {
    match: /glm-5\.3$/i,
    profile: {
      name: "GLM-5.3",
      strengths: [
        "flagship coding and long-horizon reasoning: hardest tasks, multi-step agent work, security research",
      ],
    },
  },
  {
    match: /glm-5\.2/i,
    profile: {
      name: "GLM-5.2",
      strengths: [
        "Preserved Thinking (unique to GLM): reasoning_content carries across turns — reasoning continuity no other open model has; agentic by default",
        "prompt style: high-level goals, NOT step-by-step micromanagement — give objective + context, let it plan",
      ],
    },
  },
  {
    match: /glm-4\.6v-flash/i,
    profile: {
      name: "GLM-4.6V-Flash (free tier)",
      strengths: ["free vision model: image understanding, screenshot triage"],
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
    match: /gigachat.*max/i,
    profile: {
      name: "GigaChat Max",
      strengths: ["Sber's powerful model for complex, large-scale tasks", "strong Russian-language and RU-domain handling", "no native reasoning — keep reasoning external/incremental"],
    },
  },
  {
    match: /gigachat.*pro/i,
    profile: {
      name: "GigaChat Pro",
      strengths: ["Sber's improved model, balanced quality and speed", "strong Russian-language handling", "no native reasoning — keep reasoning external/incremental"],
    },
  },
  {
    match: /gigachat-plus/i,
    profile: {
      name: "GigaChat Plus",
      strengths: ["Sber model with extended context", "strong Russian-language handling", "no native reasoning — keep reasoning external/incremental"],
    },
  },
  {
    match: /GigaChat3\.5-432B/i,
    profile: {
      name: "GigaChat 3.5 432B (Cloud.ru)",
      strengths: ["strong Russian-language and RU-domain handling", "fast interactive responses", "no native reasoning traces — keep reasoning external/incremental"],
    },
  },
  {
    match: /gigachat/i,
    profile: {
      name: "GigaChat",
      strengths: ["Sber's fast, lightweight model for routine tasks", "strong Russian-language handling", "no native reasoning — keep reasoning external/incremental"],
    },
  },
  {
    match: /deepseek-v4-flash/i,
    profile: {
      name: "DeepSeek V4 Flash",
      strengths: ["low-latency, fast responses for coding and long-context tasks", "strong reasoning; brief instructions work, structure optional"],
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
    match: /r1-distill/i,
    profile: {
      name: "DeepSeek R1-Distill (quantized)",
      strengths: ["distilled reasoning model: good step-by-step deduction", "quantized — lower memory, slight quality trade-off", "text only"],
    },
  },
  {
    match: /qwen/i,
    profile: {
      name: "Qwen 3.8 27B",
      strengths: [
        "PROMPT-SENSITIVE (more than GLM/DeepSeek): use the 6-element framework (Context, Objective, Style, Tone, Audience, Response); be maximally explicit — Qwen infers less from context",
        "Prompt Chaining > CoT for complex tasks: split into sequential messages, not single-shot; few-shot examples mandatory; separators (###, ===) help parse sections",
        "limit tool list to 2-3 — Qwen worse at tool selection from large lists; tends verbose — add explicit length constraints; one main task per turn to avoid reasoning drift",
      ],
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

/**
 * Replace an existing Model Identity section with a new one, preserving
 * any content appended after it (e.g. Fabric's session guidance).
 * The section runs from MARKER to SECTION_END (both inclusive).
 */
function replaceIdentitySection(systemPrompt: string, newSection: string): string {
  const startIdx = systemPrompt.indexOf(MARKER);
  if (startIdx === -1) return systemPrompt + "\n\n" + newSection;

  const endIdx = systemPrompt.indexOf(SECTION_END, startIdx);
  if (endIdx === -1) return systemPrompt + "\n\n" + newSection; // malformed — just append

  const fullEnd = endIdx + SECTION_END.length;
  return systemPrompt.slice(0, startIdx) + newSection + systemPrompt.slice(fullEnd);
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    const systemPrompt = (event as { systemPrompt?: string }).systemPrompt;
    if (typeof systemPrompt !== "string") return;
    const model = ctx.model ?? (event as { model?: { id?: string; provider?: string; name?: string } }).model;
    const modelId = model?.id ?? "";
    if (!modelId) return;

    const provider = (model as { provider?: string }).provider ?? "";
    const displayName = (model as { name?: string }).name ?? undefined;

    const newSection = buildIdentitySection(modelId, displayName, provider);

    // True idempotency: same model, retry/compaction re-run → section already correct.
    if (systemPrompt.includes(newSection)) return;

    // Model switched mid-session (via /model): stale section present → replace it.
    if (systemPrompt.includes(MARKER)) {
      return { systemPrompt: replaceIdentitySection(systemPrompt, newSection) };
    }

    // First run: append.
    return { systemPrompt: systemPrompt + "\n\n" + newSection };
  });
}
