export type { LandmarkAnalysisGroup } from "./landmark-analysis-group.js";
export type { LandmarkCandidate } from "./landmark-candidate.js";
export type { LandmarkDiscovery } from "./landmark-discovery.js";
export type { LandmarkEvidence } from "./landmark-evidence.js";
export type { LandmarkEvidenceSource } from "./landmark-evidence-source.js";
export type { LandmarkGroup } from "./landmark-group.js";
export type { LandmarkGroupName } from "./landmark-group-name.js";
export { landmarkGroupNames } from "./landmark-group-name.js";
export {
  groupLandmarks,
  readyGroupedLandmarks,
} from "./landmark-grouping.js";
export {
  defaultLandmarks,
  rankLandmarks,
} from "./landmark-ranking.js";
export type { LandmarkReference } from "./landmark-reference.js";
export { scoreLandmark } from "./landmark-scoring.js";
export type { LandmarkSymbol } from "./landmark-symbol.js";
export type { ScoredLandmark } from "./scored-landmark.js";

import type { LandmarkDiscovery } from "./landmark-discovery.js";
export function landmarksNotReady(): LandmarkDiscovery {
  return { state: "landmarks_not_ready", landmarks: [] };
}
