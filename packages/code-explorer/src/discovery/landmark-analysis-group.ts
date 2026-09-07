import type { LandmarkGroupName } from "./landmark-group-name.js";
import type { ScoredLandmark } from "./scored-landmark.js";

export type LandmarkAnalysisGroup = {
  group: LandmarkGroupName;
  candidates: readonly ScoredLandmark[];
  omitted_candidate_count: number;
};
