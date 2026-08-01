/**
 * Escalation report: what a stronger model needs to take over.
 */

import type { AttemptResult } from "./attempt-result.js";
import type { EscalationReport } from "./types.js";

const BEST_OUTPUT_CHARS = 2000;
const REJECTION_CHARS = 500;
const CLOSING = "Escalate to Claude: solve the specific failing assertion directly.";

function dominantSignature(attempts: AttemptResult[]): string {
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    const history = attempt.diagnostic.signature_history?.signatures ?? [];
    for (const signature of history) {
      counts.set(signature, (counts.get(signature) ?? 0) + 1);
    }
  }

  let best = "unknown";
  let bestCount = 0;
  for (const [signature, count] of counts) {
    if (count <= bestCount) continue;
    best = signature;
    bestCount = count;
  }
  return best;
}

/**
 * The attempt that got closest. A verified exit code is the only
 * requirement: an attempt that committed nothing still has output worth
 * handing to a stronger model.
 */
function leastBad(attempts: AttemptResult[]): AttemptResult | undefined {
  const graded = attempts.filter((a) => a.exitCode >= 0);
  const byExit = (a: AttemptResult, b: AttemptResult) => a.exitCode - b.exitCode || b.diff.length - a.diff.length;
  return [...graded].sort(byExit)[0];
}

function buildSummary(attempts: AttemptResult[], signature: string, rejections: string[]): string {
  const repairs = attempts.reduce((n, a) => n + a.diagnostic.repair_attempts, 0);
  const parts = [
    `${attempts.length} lineage(s) ran and none produced a verified patch.`,
    `Most frequent failure signature: ${signature}.`,
    `Repair tries: ${repairs}.`,
  ];
  if (rejections.length > 0) {
    const detail = rejections.join("; ").slice(0, REJECTION_CHARS);
    parts.push(`Degenerate rejections (${rejections.length}): ${detail}`);
  }
  parts.push(CLOSING);
  return parts.join(" ");
}

/** Build the report for a run where nothing was acceptable. */
export function buildEscalation(attempts: AttemptResult[], rejections: string[]): EscalationReport {
  const signature = dominantSignature(attempts);
  const best = leastBad(attempts);
  return {
    failure_signature: signature,
    best_partial_patch: best?.diff,
    best_output: best?.output.slice(0, BEST_OUTPUT_CHARS),
    lineages_attempted: attempts.length,
    summary: buildSummary(attempts, signature, rejections),
    lineage_diagnostics: attempts.map((a) => a.diagnostic),
  };
}

/**
 * Build the report for a run that never got a restore point. The cause
 * travels in the summary, because the caller may have no progress sink.
 */
export function checkpointFailure(cause: string): EscalationReport {
  const why = `Failed to create gitevo checkpoint: ${cause}.`;
  return {
    failure_signature: "checkpoint_failed",
    lineages_attempted: 0,
    summary: `No attempt ran. ${why} ${CLOSING}`,
    lineage_diagnostics: [],
  };
}
