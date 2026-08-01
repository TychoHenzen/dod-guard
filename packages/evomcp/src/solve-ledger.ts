/**
 * Ledger updates that follow one finished attempt.
 */

import type { AttemptResult } from "./attempt-result.js";
import { recordAttempt } from "./budget.js";
import { type SolveRun, TOKENS_UNMEASURED } from "./solve-run.js";
import { screenCandidate } from "./solve-screen.js";
import type { TaskSpec } from "./types.js";

/**
 * Add the attempt token delta to the run total and to the budget.
 * The delta was measured once, by runAttempt.
 */
export function recordCost(run: SolveRun, attempt: AttemptResult, elapsedMs: number): void {
  const delta = attempt.diagnostic.lineage_tokens ?? TOKENS_UNMEASURED;
  // A zero delta means the proxy reported no spend, which is not a
  // measurement. Adding it would erase the "not measured" sentinel.
  if (delta > 0) {
    const sofar = Math.max(run.stats.tokens_consumed, 0);
    run.stats.tokens_consumed = sofar + delta;
  }
  const spend = Math.max(delta, 0);
  run.budget = recordAttempt(run.budget, "implement", spend, elapsedMs);
}

/**
 * Put a passing attempt through the refusal filters, then file it as a
 * survivor or as a rejection. Returns true when the attempt survived.
 */
export function screenAttempt(run: SolveRun, attempt: AttemptResult, spec: TaskSpec): boolean {
  if (!attempt.passed) return false;

  const rejection = screenCandidate(attempt, spec);
  if (!rejection) {
    run.survivors.push(attempt);
    return true;
  }

  run.rejections.push(rejection);
  attempt.diagnostic.final_status = "failed";
  return false;
}

/** Report each budget threshold once. */
export function emitBudgetWarnings(run: SolveRun, onProgress?: (msg: string) => void): void {
  for (const warning of run.budget.warnings) {
    const key = `${warning.stage}:${warning.threshold}`;
    if (run.warned.has(key)) continue;
    run.warned.add(key);
    const at = `${warning.threshold}% (${warning.resource})`;
    onProgress?.(`  Budget: ${warning.stage} at ${at}`);
  }
}
