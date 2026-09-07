export type { LandmarkAnalysisGroup } from "./landmark-analysis-group.js";
export type { LandmarkCandidate } from "./landmark-candidate.js";
export type { LandmarkDiscovery } from "./landmark-discovery.js";
export type { LandmarkEvidence } from "./landmark-evidence.js";
export type { LandmarkEvidenceSource } from "./landmark-evidence-source.js";
export type { LandmarkGroup } from "./landmark-group.js";
export { landmarkGroupNames } from "./landmark-group-name.js";
export type { LandmarkGroupName } from "./landmark-group-name.js";
export type { LandmarkReference } from "./landmark-reference.js";
export type { LandmarkSymbol } from "./landmark-symbol.js";
export type { ScoredLandmark } from "./scored-landmark.js";
export {
  groupLandmarks,
  readyGroupedLandmarks,
} from "./landmark-grouping.js";
export {
  defaultLandmarks,
  rankLandmarks,
} from "./landmark-ranking.js";
export { scoreLandmark } from "./landmark-scoring.js";

import type { LandmarkDiscovery } from "./landmark-discovery.js";
import type { LandmarkGroup } from "./landmark-group.js";

const maxLandmarkGroups = 5;
const maxLandmarksPerGroup = 12;

export function readyLandmarks(
  groups: readonly LandmarkGroup[],
): LandmarkDiscovery {
  return {
    state: "ready",
    landmarks: groups.slice(0, maxLandmarkGroups).map((group) => ({
      group: group.group,
      symbols: group.symbols.slice(0, maxLandmarksPerGroup),
      ...(group.omitted_candidate_count === undefined
        ? {}
        : { omitted_candidate_count: group.omitted_candidate_count }),
    })),
  };
}

export function landmarksNotReady(): LandmarkDiscovery {
  return { state: "landmarks_not_ready", landmarks: [] };
}
