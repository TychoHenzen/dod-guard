/**
 * The record one failing attempt builds up while it is repaired.
 *
 * Each try adds a summary and a failure signature. The repair prompt reads
 * the summaries. The escalation ladder reads the signatures.
 */

import { hashFailure } from "./agent.js";
import type { AttemptResult } from "./attempt-result.js";
import type { AttemptSummary } from "./context.js";
import type { SolvePlan } from "./solve-plan.js";
import type { SolveSession } from "./solve-session.js";

/** Characters of a failing verification kept as an attempt summary. */
const SUMMARY_CHARS = 500;

/** One failing attempt, plus everything its repairs have learned. */
export interface Lineage {
  plan: SolvePlan;
  session: SolveSession;
  state: AttemptResult;
  /** One entry per try so far, oldest first. */
  summaries: AttemptSummary[];
  /** Failure signature of every try so far, oldest first. */
  history: string[];
}

/** Open a record for an attempt that just failed its first verification. */
export function openLineage(plan: SolvePlan, session: SolveSession, state: AttemptResult): Lineage {
  const lineage: Lineage = {
    plan,
    session,
    state,
    summaries: [],
    history: [],
  };
  recordTry(lineage);
  return lineage;
}

/** File the current verification output as one more failed try. */
export function recordTry(lineage: Lineage): void {
  const { state, plan, session } = lineage;
  const signature = hashFailure(state.output, session.spec.cwd);
  lineage.history.push(signature);
  lineage.summaries.push({
    strategy: plan.label,
    outcome: "failed",
    summary: state.output.slice(0, SUMMARY_CHARS),
    failureSignature: signature,
  });
}
