/**
 * Abandoning a branch the run does not keep.
 *
 * gitevo abandons whatever branch is checked out, so every abandon has to
 * check out its target first. The abandon reverts the branch and records the
 * reason as a lesson, which is how a failed try reaches the next session.
 */

import type { AttemptResult } from "./attempt-result.js";
import { abandonLoser } from "./gitevo-integration.js";
import { checkoutBranch } from "./solve-git.js";
import type { SolveSession } from "./solve-session.js";

/**
 * Check out a branch, then abandon it. A branch git cannot check out was
 * never created, so there is nothing to revert.
 */
export async function abandonBranch(branch: string, reason: string, cwd: string): Promise<void> {
  if (!checkoutBranch(cwd, branch)) return;
  await abandonLoser(branch, reason, cwd).catch(() => undefined);
}

/**
 * Abandon the branch of an attempt that did not survive, so the working
 * directory does not end the run holding failed work.
 */
export async function discardAttempt(attempt: AttemptResult, session: SolveSession): Promise<void> {
  const { lineage_id, final_status, repair_attempts } = attempt.diagnostic;
  const reason = `${lineage_id}: ${final_status} after ${repair_attempts} repair try(s)`;
  await abandonBranch(attempt.branch, reason, session.spec.cwd);
}
