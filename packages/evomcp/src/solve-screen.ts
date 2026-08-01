/**
 * The two refusal filters a passing candidate still has to clear.
 *
 * A change that satisfies the success command can still game the check or
 * reach outside the caller allow list. Either one is a refusal.
 */

import type { AttemptResult } from "./attempt-result.js";
import { detectDegenerate, isDegenerateReject } from "./degenerate.js";
import { filesMatchGlob } from "./solve-glob.js";
import type { TaskSpec } from "./types.js";

/**
 * Return a refusal reason, or null when the candidate is acceptable.
 * An empty change set is not degenerate. An absent allow list skips the
 * second filter.
 */
export function screenCandidate(attempt: AttemptResult, spec: TaskSpec): string | null {
  const id = attempt.diagnostic.lineage_id;

  const report = detectDegenerate(attempt.diff);
  if (isDegenerateReject(report)) {
    return `${id} rejected as degenerate: ${report.summary}`;
  }

  const outside = filesMatchGlob(attempt.diff, spec.allowed_files ?? []);
  if (outside.length > 0) {
    return `${id} rejected, outside allowed_files: ${outside.join(", ")}`;
  }

  return null;
}
