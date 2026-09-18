//
// llm — bare inference primitive for the fabric_exec guest
// Map/reduce over chunks you already hold: one completion per call, no tools,
// no memory, no subagent overhead. Structured output: ask for JSON in the prompt.
//
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

const extractText = (content: unknown): { text: string; types: string } => {
  if (typeof content === 'string') return { text: content, types: 'string' };
  if (!Array.isArray(content)) return { text: '', types: 'none' };
  const parts = content.filter((b: any) => !!b && typeof b.text === 'string');
  const text = parts.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  if (text) return { text, types: parts.map((b: any) => b.type).join('+') };
  const alt = parts.map((b: any) => '[' + b.type + '] ' + b.text).join('');
  const types = parts.map((b: any) => b.type).join('+') || 'empty';
  return { text: alt, types };
};

export default function (pi: ExtensionAPI) {


  pi.registerTool({
    name: 'llm',
    label: 'Bare LLM call',
    description:
      'One bare completion: no tools, no memory, no subagent. Map/reduce over chunks you ' +
      'already have — summarize/classify/extract per item, batched with Promise.all. ' +
      'NOT for exploration (use subagents).',
    promptSnippet: 'llm(prompt) → bare completion (no tools/session)',
    promptGuidelines: [
      'Use llm for per-chunk transforms inside one fabric_exec program (map/reduce).',
      'Use subagents instead when the work needs tools, memory, or exploration.',
    ],
    parameters: Type.Object({
      prompt: Type.String({ description: 'Instruction for this completion' }),
      system: Type.Optional(Type.String({ description: 'Optional system prompt' })),
      model: Type.Optional(
        Type.String({ description: 'Override as "provider/id" (e.g. "zai/glm-5.3-flash"). Default: session model' })
      ),
      maxTokens: Type.Optional(Type.Number({ description: 'Completion token budget' })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const registry: any = (ctx as any).modelRegistry;
      if (!registry) throw new Error('modelRegistry unavailable');

      let model: any;
      if (params.model) {
        const slash = String(params.model).indexOf('/');
        const provider = slash > 0 ? String(params.model).slice(0, slash) : String(params.model);
        const id = slash > 0 ? String(params.model).slice(slash + 1) : '';
        model = registry.find(provider, id);
        if (!model) throw new Error('model not found: ' + params.model);
      } else {
        model = (ctx as any).model;
      }
      if (!model) throw new Error('no model resolved');
      if (registry.hasConfiguredAuth && !registry.hasConfiguredAuth(model)) {
        throw new Error('no auth configured for ' + model.provider + '/' + model.id);
      }

      const context: any = {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: String(params.prompt) }],
            timestamp: Date.now(),
          },
        ],
      };
      context.systemPrompt = String(
        params.system ?? 'You are a utility function inside an agent program. Answer plainly: no markdown, no commentary.'
      );
      context.tools = []; // adapters may .filter() this — never leave it absent

      const options: any = { reasoning: 'off', maxTokens: params.maxTokens ?? 1024 };
      if (signal) options.signal = signal;

      // completeSimple = bare path (no agent/tool pipeline); complete() routes through the full stream
      const path = registry.completeSimple ? 'completeSimple' : 'complete(fallback)';
      let response: any;
      try {
        const call = registry.completeSimple ?? registry.complete.bind(registry);
        response = await call.call(registry, model, context, options);
      } catch (e: any) {
        throw new Error('llm-ext/v4 [' + path + '] inner: ' + (e?.message ?? String(e)));
      }
      let ex = extractText(response?.content);
      if (!ex.text && response?.stopReason === 'length') {
        // reasoning burned the budget: one retry with tripled tokens
        const retryOpts: any = { ...options, maxTokens: (params.maxTokens ?? 256) * 3 };
        try {
          const call = registry.completeSimple ?? registry.complete.bind(registry);
          response = await call.call(registry, model, context, retryOpts);
          ex = extractText(response?.content);
        } catch (e: any) { /* keep original empty result */ }
      }
      const text = ex.text;
      return {
        content: [{ type: 'text', text }],
        details: {
          ok: Boolean(text),
          blockTypes: ex.types,
          model: model.provider + '/' + model.id,
          usage: response?.usage ?? undefined,
          stopReason: response?.stopReason ?? undefined,
        },
      };
    },
  });
}
