/**
 * The fanout loop: one pass over the plans, one attempt at a time.
 */

import { discardAttempt } from "./solve-abandon.js";
import { runAttempt } from "./solve-attempt.js";
import * as ledger from "./solve-ledger.js";
import type { SolvePlan } from "./solve-plan.js";
import type { SolveRun } from "./solve-run.js";
import type { SolveSession } from "./solve-session.js";

/**
 * Carry the budget verdict to the attempts that follow. An exhausted budget
 * stops the repair loop. It never cancels a first try, because every plan is
 * a separate approach and each one deserves one worker run.
 */
function markBudget(run: SolveRun, session: SolveSession): void {
  if (!run.budget.exhausted || session.budgetExhausted) return;
  session.budgetExhausted = true;
  session.onProgress?.("Budget exhausted. Repairs stop, first tries go on.");
}

async function runOne(plan: SolvePlan, session: SolveSession, run: SolveRun): Promise<void> {
  const startedAt = Date.now();
  const attempt = await runAttempt(plan, session);

  run.attempts.push(attempt);
  run.stats.candidates_generated += 1 + attempt.diagnostic.repair_attempts;
  ledger.recordCost(run, attempt, Date.now() - startedAt);

  const survived = ledger.screenAttempt(run, attempt, session.spec);
  if (!survived) await discardAttempt(attempt, session);

  ledger.emitBudgetWarnings(run, session.onProgress);
  markBudget(run, session);
}

/**
 * Run every plan in turn. Attempts never run at the same time, because
 * they share one working directory and each needs its own branch.
 */
export async function runAttempts(plans: SolvePlan[], session: SolveSession, run: SolveRun): Promise<void> {
  for (const plan of plans) {
    await runOne(plan, session, run);
  }
}
