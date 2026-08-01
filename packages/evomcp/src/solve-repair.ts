/**
 * Repair loop for one failing attempt.
 *
 * The escalation ladder decides how many further tries the attempt gets.
 * Tries stop when the ladder leaves the retry and resample rungs. They also
 * stop on a timeout, on an empty run budget, and on a passing verification.
 */

import type { AttemptResult } from "./attempt-result.js";
import { applyVerification } from "./attempt-result.js";
import { createEscalationState, evaluateEscalation, recordFailure } from "./escalation.js";
import { compileFeedback } from "./feedback.js";
import { repairPrompt } from "./prompts.js";
import { repairContext } from "./solve-context.js";
import { captureDiff, commitCandidate } from "./solve-git.js";
import { type Lineage, openLineage, recordTry } from "./solve-lineage.js";
import type { SolvePlan } from "./solve-plan.js";
import type { SolveSession } from "./solve-session.js";
import { canContinue, readSignals } from "./solve-signals.js";
import { runVerification } from "./solve-verify.js";
import { REPAIR_TIMEOUT_MS, spawnWorker } from "./solve-worker.js";

async function runRepair(lineage: Lineage): Promise<boolean> {
  const { plan, session, state } = lineage;
  const { spec } = session;
  const round = state.diagnostic.repair_attempts;
  const diagnostics = compileFeedback(state.output, spec.cwd, "verify");
  session.onProgress?.(`  [${plan.index + 1}] repair ${round}: ${diagnostics.length} diag`);

  const context = repairContext(spec, lineage.summaries);
  const prompt = repairPrompt(spec.goal, diagnostics, round, context);
  const worker = await spawnWorker(prompt, session, REPAIR_TIMEOUT_MS);
  if (worker.timedOut) {
    state.diagnostic.timed_out = true;
    state.diagnostic.final_status = "timed_out";
    return false;
  }

  commitCandidate(spec.cwd, `solve strategy ${plan.index} repair ${round}`);
  state.diff = captureDiff(spec.cwd, `${session.rootBranch}...${state.branch}`);
  applyVerification(state, await runVerification(spec));
  return true;
}

/** True when the lineage still fails and may try again. */
async function tryOneRepair(lineage: Lineage): Promise<boolean> {
  const { state } = lineage;
  state.diagnostic.repair_attempts++;
  if (!(await runRepair(lineage))) return false;
  if (!state.passed) return true;
  state.diagnostic.final_status = "passed";
  return false;
}

/**
 * Give a failed attempt further tries until the ladder stops them.
 */
export async function repairLineage(plan: SolvePlan, session: SolveSession, state: AttemptResult): Promise<void> {
  const lineage = openLineage(plan, session, state);
  let ladder = createEscalationState();

  while (!session.budgetExhausted) {
    const signals = readSignals(state, lineage.history);
    const decision = evaluateEscalation(recordFailure(ladder), signals);
    ladder = decision.state;

    if (!canContinue(decision)) {
      state.diagnostic.final_status = "stuck";
      return;
    }
    if (!(await tryOneRepair(lineage))) return;
    recordTry(lineage);
  }
}
