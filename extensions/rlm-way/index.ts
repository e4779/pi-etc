/**
 * rlm-way entry — picks the backend at load time:
 *  - full: @runtimed/node + runtimed daemon (state persists across pi sessions)
 *  - lite: plain python3 NDJSON kernel (no daemon; per-session state)
 *
 * Set RLM_WAY_FORCE_LITE=1 to force the lite backend (testing, sandboxes).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import full, { fullBackendAvailable } from "./repl.js";
import { lite, pythonAvailable } from "./lite.js";

export { fullBackendAvailable } from "./repl.js";

export default function rlmWay(pi: ExtensionAPI): void {
  const forceLite = process.env.RLM_WAY_FORCE_LITE === "1";
  if (forceLite || (!fullBackendAvailable() && pythonAvailable())) {
    lite(pi);
  } else {
    full(pi);
  }
}
