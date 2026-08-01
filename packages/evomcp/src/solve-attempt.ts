/**
 * One attempt at the goal, start to finish.
 *
 * Attempts run one at a time. They share a single working directory, and
 * each one needs that directory on its own branch.
 */

import type { AgentResult } from "./agent.js";
import { getProxyCost, type ProxyCostSnapshot, proxyTokenDelta } from "./agent.js";
import { type AttemptResult, applyVerification, blankResult, markNoOutput, markSpawnFailed } from "./attempt-result.js";
import { spawnCandidate } from "./gitevo-integration.js";
import { captureDiff, checkoutBranch, commitCandidate } from "./solve-git.js";
import type { SolvePlan } from "./solve-plan.js";
import { repairLineage } from "./solve-repair.js";
import type { SolveSession } from "./solve-session.js";
import { runVerification } from "./solve-verify.js";
import { FIRST_TIMEOUT_MS, spawnWorker } from "./solve-worker.js";

/** Restore point every attempt branches from. */
export const CHECKPOINT_NAME = "solve";

const WORKER_SAMPLE_CHARS = 500;

async function startBranch(state: AttemptResult, session: SolveSession): Promise<boolean> {
  session.onProgress?.(`  spawning branch ${state.branch}`);
  try {
    await spawnCandidate(CHECKPOINT_NAME, state.branch, session.spec.cwd);
  } catch (err) {
    session.onProgress?.(`  branch failed: ${String(err).slice(0, 120)}`);
    return false;
  }
  return checkoutBranch(session.spec.cwd, state.branch);
}

function recordWorker(state: AttemptResult, worker: AgentResult): boolean {
  const diagnostic = state.diagnostic;
  diagnostic.claude_exit_code = worker.exitCode;
  diagnostic.claude_output_sample = worker.output.slice(0, WORKER_SAMPLE_CHARS);

  if (worker.timedOut) {
    diagnostic.timed_out = true;
    diagnostic.final_status = "timed_out";
    return false;
  }
  if (worker.output.trim()) return true;
  markNoOutput(state);
  return false;
}

async function gradeCandidate(plan: SolvePlan, session: SolveSession, state: AttemptResult): Promise<void> {
  const { spec } = session;
  commitCandidate(spec.cwd, `solve strategy ${plan.index}`);
  state.diff = captureDiff(spec.cwd, `${session.rootBranch}...${state.branch}`);
  session.onProgress?.(`  [${plan.index + 1}] Verifying ${state.branch}`);

  applyVerification(state, await runVerification(spec));
  if (!state.passed) return repairLineage(plan, session, state);

  state.diagnostic.final_status = "passed";
  session.onProgress?.(`  [${plan.index + 1}] PASSED`);
}

async function attemptBody(plan: SolvePlan, session: SolveSession): Promise<AttemptResult> {
  const state = blankResult(plan);
  if (!(await startBranch(state, session))) return markSpawnFailed(state);

  const worker = await spawnWorker(plan.prompt, session, FIRST_TIMEOUT_MS);
  if (!recordWorker(state, worker)) return state;

  await gradeCandidate(plan, session, state);
  return state;
}

/**
 * Run one attempt and measure its token spend exactly once.
 */
export async function runAttempt(plan: SolvePlan, session: SolveSession): Promise<AttemptResult> {
  const costBefore: ProxyCostSnapshot | null = session.proxyReady ? await getProxyCost() : null;
  const failed = () => markNoOutput(blankResult(plan));
  const state = await attemptBody(plan, session).catch(failed);

  state.diagnostic.lineage_tokens = await proxyTokenDelta(costBefore);
  const status = state.diagnostic.final_status;
  session.onProgress?.(`  [${plan.index + 1}] completed: ${status}`);
  return state;
}
