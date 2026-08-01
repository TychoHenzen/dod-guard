/**
 * One call to the cheap worker, with the session settings applied.
 *
 * A worker that throws is treated the same as a worker that said nothing.
 */

import type { AgentResult } from "./agent.js";
import { spawnClaude } from "./agent.js";
import type { SolveSession } from "./solve-session.js";

/** Time limit for the first try of an attempt. */
export const FIRST_TIMEOUT_MS = 300_000;

/** Time limit for a repair try. */
export const REPAIR_TIMEOUT_MS = 180_000;

const SILENT: AgentResult = {
  output: "",
  exitCode: -1,
  durationMs: 0,
  timedOut: false,
};

/** Run the worker in the shared working directory. */
export async function spawnWorker(prompt: string, session: SolveSession, timeoutMs: number): Promise<AgentResult> {
  const { spec } = session;
  return spawnClaude(prompt, {
    cwd: spec.cwd,
    model: spec.model,
    apiKey: spec.api_key,
    useProxy: session.proxyReady,
    timeoutMs,
  }).catch(() => ({ ...SILENT }));
}
