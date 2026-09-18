import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * fabric-bun-guidance — replaces pi-fabric's default execution guidance
 * (slot "fabric.execution") with Bun-first examples on machines running the
 * bun-process guest.
 *
 * The component definition is registered over the pi event bus — the
 * sanctioned seam (pi-fabric:component:{register,discover}:v1, same pattern
 * as pi-fabric-continuity's provider). guide() itself is only reachable from
 * a component's activate(); this extension is the bridge. fabric.json pins
 * the entry, without it nothing activates and upstream's default stays:
 *
 *   "components": [{ "id": "bun-first-guidance", "component": "bun-first-guidance" }]
 *
 * Replaces the in-fork prompt patch (reverted in a28ca06'): no upstream
 * divergence, per-machine opt-in, and QuickJS guests never see Bun text.
 */

const REGISTER = "pi-fabric:component:register:v1";
const DISCOVER = "pi-fabric:component:discover:v1";

const CONTENT = `Examples and returns: start every program with \`__bun\` — the Bun namespace is prebound in the bun-process guest (upstream PR #154); bare \`Bun\`, \`process\`, \`fetch\`, and \`Buffer\` are scrubbed globals and fail typecheck. Vanilla-runtime fallback only: \`const bun: any = await import('bun' as string)\`.
Default I/O is Bun in-guest: \`bun.file('/x').text()\`, \`bun.write('/y', data)\`, \`new bun.Glob('**/*.ts').scanSync({ cwd: 'src', onlyFiles: true })\`, shell via \`await bun.$\`rg -n TODO src\`.quiet().text()\`; batch independent work in one program; JS timers work (host-intercepted) but cost a round-trip per tick — prefer native timeouts (timeout N, timeoutMs).
Host \`pi.*\` calls are the typed escape hatch: \`pi.read('/x')\` (image pipe, bounded reads), \`pi.grep('TODO','src')\` / \`pi.grep({pattern:'TODO', path:'src', ignoreCase:true, context:2})\`, \`pi.find({pattern:'*.ts', path:'src', limit:20})\`, and \`pi.ls('src')\` return strings; \`pi.bash({cmd:'ls'})\` (or \`pi.powershell\` on Windows), \`pi.edit({path:'/x', old:'a', new:'b'})\`, and \`pi.write({path:'/y', text:'z'})\` return \`{ok, output, details}\` (read \`.output\`); failed core calls reject, including shell tools on an ordinary nonzero exit; pass \`settle: true\` to \`pi.bash\` or \`pi.powershell\` to get \`{ ok: false, exitCode, output, error }\` instead. Timeout, cancellation, approval, and security failures still reject.
\`tools\` is discovery + generic calls only (\`providers\`/\`catalog\`/\`list\`/\`search\`/\`describe\`/\`call\`/\`models\`). Call known MCP tools as \`mcp.<sanitized_server>.<sanitized_tool>(args)\`, captured tools as \`extensions.<tool>(args)\`, and stable providers as \`memory.*\`, \`state.*\`, \`schema.*\`, or \`compact.*\`. Use \`tools.call({ref,args})\` for computed refs. \`pi\` is the core tools; \`π.<key>\` reads named \`strings\` (not a tool).`;

const definition = {
	name: "bun-first-guidance",
	description:
		"Replaces the default fabric.execution guidance slot with Bun-first examples for bun-process guests.",
	guarantee: "revertible",
	activate(context: unknown) {
		const c = context as {
			guide(g: {
				label: string;
				models: readonly string[];
				content: string;
				placement: "replace";
				slot: string;
			}): () => void;
		};
		return c.guide({
			label: "bun-first-execution-guidance",
			models: ["*/*"],
			placement: "replace",
			slot: "fabric.execution",
			content: CONTENT,
		});
	},
};

export default function (pi: ExtensionAPI): void {
		const bus = (pi as unknown as { events: { emit(n: string, p: unknown): void; on(n: string, h: (e: unknown) => void): void } }).events;
	const registration = { version: 1, component: definition, overwrite: true };
	bus.emit(REGISTER, registration);
	bus.on(DISCOVER, (event: unknown) => {
		const ev = event as { register?: (c: unknown, o?: { overwrite?: boolean }) => void } | undefined;
		if (ev && typeof ev.register === "function") ev.register(definition, { overwrite: true });
	});
}
