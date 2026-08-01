/**
 * Best-of-N solver.
 *
 * The answer is either an accepted change with the evidence that it
 * passes, or a per-attempt record of why nobody got there.
 */

import { evo_checkpoint } from "../../gitevo/dist/operations.js";
import { ensureProxy, extractScore, runCommand } from "./agent.js";
import { budgetSummary } from "./budget.js";
import { getRootBranch } from "./git-helpers.js";
import { CHECKPOINT_NAME } from "./solve-attempt.js";
import { finalize } from "./solve-finish.js";
import { runAttempts } from "./solve-loop.js";
import { buildPlans } from "./solve-plan.js";
import { checkpointFailure } from "./solve-report.js";
import { createRun, type SolveRun } from "./solve-run.js";
import type { SolveSession } from "./solve-session.js";
import type { SolveResult, TaskSpec } from "./types.js";

const DEFAULT_FANOUT = 5;
const SCALAR_PROBE_TIMEOUT_MS = 30_000;
const CAUSE_CHARS = 200;

/**
 * True when a command exits 0 and prints a number. Such a goal has a
 * scalar fitness and belongs in evolve rather than solve.
 */
export function detectScalarFitness(cmd: string, cwd: string): boolean {
  try {
    const result = runCommand(cmd, cwd, SCALAR_PROBE_TIMEOUT_MS);
    if (result.exitCode !== 0) return false;
    return extractScore(result.output) !== null;
  } catch {
    return false;
  }
}

/** Returns the failure cause, or null when the restore point exists. */
async function createCheckpoint(spec: TaskSpec, onProgress?: (msg: string) => void): Promise<string | null> {
  try {
    await evo_checkpoint(CHECKPOINT_NAME, "before the solve fanout", spec.cwd);
    return null;
  } catch (err) {
    const cause = String(err).slice(0, CAUSE_CHARS);
    onProgress?.(`Checkpoint failed: ${cause}`);
    return cause;
  }
}

function abortWithoutCheckpoint(run: SolveRun, cause: string): SolveResult {
  run.stats.duration_ms = Date.now() - run.startedAt;
  return {
    outcome: "escalate",
    escalation: checkpointFailure(cause),
    stats: run.stats,
  };
}

function openSession(spec: TaskSpec, proxyReady: boolean, onProgress?: (msg: string) => void): SolveSession {
  if (!proxyReady) {
    onProgress?.("WARNING: the deepclaude proxy is down. Trying direct mode.");
  }
  return {
    spec,
    rootBranch: getRootBranch(spec.cwd),
    proxyReady,
    budgetExhausted: false,
    onProgress,
  };
}

/**
 * Make several independent attempts at one goal and adopt at most one.
 */
export async function solve(spec: TaskSpec, onProgress?: (msg: string) => void): Promise<SolveResult> {
  const run = createRun(spec);
  const cause = await createCheckpoint(spec, onProgress);
  if (cause) return abortWithoutCheckpoint(run, cause);

  const session = openSession(spec, await ensureProxy(), onProgress);
  const sampled = spec.fanout ?? DEFAULT_FANOUT;
  const plans = buildPlans(spec, sampled);
  run.stats.plans_sampled = sampled;
  run.stats.plans_deduped = plans.length;

  onProgress?.(`Testing ${plans.length} approach(es), one at a time.`);
  await runAttempts(plans, session, run);
  onProgress?.(budgetSummary(run.budget));

  return finalize(run, session);
}
