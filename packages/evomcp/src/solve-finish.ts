/**
 * The one answer path: none acceptable, or exactly one adopted.
 */

import { buildEscalation } from "./solve-report.js";
import type { SolveRun } from "./solve-run.js";
import { type Selection, selectWinner } from "./solve-select.js";
import type { SolveSession } from "./solve-session.js";
import type { SolveResult } from "./types.js";

function refusals(run: SolveRun): string[] | undefined {
  return run.rejections.length > 0 ? run.rejections : undefined;
}

/**
 * Turn the ledger into the caller answer. Both branches record the same
 * spend figure and the same refusal list.
 */
export async function finalize(run: SolveRun, session: SolveSession): Promise<SolveResult> {
  run.stats.duration_ms = Date.now() - run.startedAt;

  if (run.survivors.length === 0) {
    return {
      outcome: "escalate",
      escalation: buildEscalation(run.attempts, run.rejections),
      degenerate_rejections: refusals(run),
      stats: run.stats,
    };
  }

  const selection: Selection = await selectWinner(run.survivors, session);
  session.onProgress?.(`Adopted ${selection.winner.branch}.`);

  return {
    outcome: "pass",
    patch: selection.patch,
    verification_report: selection.winner.report,
    judge_verdict: selection.verdict,
    degenerate_rejections: refusals(run),
    stats: run.stats,
  };
}
