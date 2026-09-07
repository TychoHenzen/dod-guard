import type { LandmarkAnalysisGroup } from "./landmark-analysis-group.js";
import type { LandmarkCandidate } from "./landmark-candidate.js";
import { landmarkGroupFor } from "./landmark-classification.js";
import type { LandmarkDiscovery } from "./landmark-discovery.js";
import { landmarkGroupNames } from "./landmark-group-name.js";
import { compareRankedLandmarks } from "./landmark-ranking.js";
import { scoreLandmark } from "./landmark-scoring.js";

const defaultGroupLimit = 12;
const maxGroupLimit = 50;
/** Groups eligible landmarks by literal whole-name suffixes and bounds each
 * result list.
 */
export function groupLandmarks(
  candidates: readonly LandmarkCandidate[],
  perGroupLimit = defaultGroupLimit,
): LandmarkAnalysisGroup[] {
  if (perGroupLimit > maxGroupLimit)
    throw new RangeError("landmark_group_limit_exceeded");
  const scoredCandidates = candidates
    .map((candidate) => ({ candidate, landmark: scoreLandmark(candidate) }))
    .filter(({ landmark }) => landmark.eligible)
    .sort(compareRankedLandmarks);
  return landmarkGroupNames.flatMap((group) => {
    const matches = scoredCandidates
      .filter(({ candidate }) => landmarkGroupFor(candidate) === group)
      .map(({ landmark }) => landmark);
    return matches.length
      ? [
          {
            group,
            candidates: matches.slice(0, perGroupLimit),
            omitted_candidate_count: Math.max(
              0,
              matches.length - perGroupLimit,
            ),
          },
        ]
      : [];
  });
}

export function readyGroupedLandmarks(
  candidates: readonly LandmarkCandidate[],
  perGroupLimit = defaultGroupLimit,
): LandmarkDiscovery {
  return {
    state: "ready",
    landmarks: groupLandmarks(candidates, perGroupLimit).map((group) => ({
      group: group.group,
      symbols: group.candidates,
      omitted_candidate_count: group.omitted_candidate_count,
    })),
  };
}
