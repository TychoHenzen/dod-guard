import type { LandmarkEvidence } from "./landmark-evidence.js";
import type { LandmarkSymbol } from "./landmark-symbol.js";

export type ScoredLandmark = LandmarkSymbol & {
  evidence: LandmarkEvidence;
  score: number;
  eligible: boolean;
};
