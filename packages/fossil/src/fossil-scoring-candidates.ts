import type { BurstFileActivity, FossilFinding } from "./types.js";
import type { AdvisoryFossilFindingInput } from "./fossil-scoring-types/advisory-fossil-finding-input.js";
import type { BurstCandidateEvidence } from "./fossil-scoring-types/burst-candidate-evidence.js";

/** Normalizes one candidate's positive burst churn against the positive burst maximum. */
export function normalizedBurstChurn(candidate: BurstFileActivity, burstFiles: readonly BurstFileActivity[]): number {
  const maximumBurstCommits = Math.max(0, ...burstFiles.map((activity) => activity.burstCommits));
  if (maximumBurstCommits === 0) return 0;
  return Math.max(0, candidate.burstCommits) / maximumBurstCommits;
}

/** Scores the absence of post-burst commits for one candidate. */
export function abandonmentScore(candidate: BurstFileActivity): number {
  if (candidate.burstCommits <= 0) return 0;
  return Math.max(0, 1 - candidate.postBurstCommits / candidate.burstCommits);
}

/** Returns whether a score meets the inclusive fossil finding threshold. */
export function meetsFossilThreshold(score: number, threshold: number): boolean {
  return score >= threshold;
}

/** Retains every qualifying burst-specific candidate without deduplicating matching paths. */
export function qualifyingBurstCandidates(
  candidates: readonly BurstCandidateEvidence[],
  threshold: number,
): readonly BurstCandidateEvidence[] {
  return candidates.filter((candidate) => meetsFossilThreshold(candidate.score.score, threshold));
}

/** Builds a fossil finding that remains advisory regardless of its score. */
export function createAdvisoryFossilFinding(input: AdvisoryFossilFindingInput): FossilFinding {
  return { ...input, classification: "advisory" };
}
