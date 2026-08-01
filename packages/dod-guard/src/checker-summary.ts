// Builds the one-line human-readable summary for a check result.
import type { CheckOverall } from "./types.js";

export function buildSummary(
  overall: CheckOverall,
  counts: { pass: number; total: number; draft: number },
): string {
  const draftNote =
    counts.draft > 0 ? `, ${counts.draft} draft(s) pending` : "";
  return (
    `${overall.toUpperCase()}: ${counts.pass}/${counts.total} ` +
    `proof(s) passed${draftNote}.`
  );
}
