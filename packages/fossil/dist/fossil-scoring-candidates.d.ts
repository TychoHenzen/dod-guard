import type { BurstFileActivity, FossilFinding } from "./types.js";
import type { AdvisoryFossilFindingInput } from "./fossil-scoring-types.js";
/** Normalizes positive burst churn against the positive burst maximum. */
export declare function normalizedBurstChurn(candidate: BurstFileActivity, burstFiles: readonly BurstFileActivity[]): number;
/** Scores the absence of post-burst commits for one candidate. */
export declare function abandonmentScore(candidate: BurstFileActivity): number;
/** Returns whether a score meets the inclusive fossil finding threshold. */
export declare function meetsFossilThreshold(score: number, threshold: number): boolean;
/** Builds a fossil finding that remains advisory regardless of its score. */
export declare function createAdvisoryFossilFinding(input: AdvisoryFossilFindingInput): FossilFinding;
