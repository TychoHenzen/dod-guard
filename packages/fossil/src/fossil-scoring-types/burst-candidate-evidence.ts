import type { BurstFileActivity } from "../types.js";
import type { FossilScore } from "./fossil-score.js";

/** One scored candidate activity retained with its burst-specific evidence. */
export interface BurstCandidateEvidence {
  readonly burstId: string;
  readonly activity: BurstFileActivity;
  readonly score: FossilScore;
}
