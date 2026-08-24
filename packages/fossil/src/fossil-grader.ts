import type { BurstFileActivity } from "./types.js";

/** Normalizes one candidate's positive burst churn against the positive burst maximum. */
export function normalizedBurstChurn(candidate: BurstFileActivity, burstFiles: readonly BurstFileActivity[]): number {
  const maximumBurstCommits = Math.max(0, ...burstFiles.map((activity) => activity.burstCommits));
  if (maximumBurstCommits === 0) return 0;
  return Math.max(0, candidate.burstCommits) / maximumBurstCommits;
}
