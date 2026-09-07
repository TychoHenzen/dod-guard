import { landmarkGroupIndex } from "./landmark-classification.js";
import type { LandmarkCandidate } from "./landmark-candidate.js";
import type { ScoredLandmark } from "./scored-landmark.js";
import { scoreLandmark } from "./landmark-scoring.js";

export function compareRankedLandmarks(
  left: { candidate: LandmarkCandidate; landmark: ScoredLandmark },
  right: { candidate: LandmarkCandidate; landmark: ScoredLandmark },
): number {
  if (left.landmark.score !== right.landmark.score)
    return right.landmark.score - left.landmark.score;
  return landmarkTieKey(left.candidate).localeCompare(
    landmarkTieKey(right.candidate),
  );
}

function landmarkTieKey(candidate: LandmarkCandidate): string {
  const group = landmarkGroupIndex(candidate);
  const path = candidate.symbol.path
    .normalize("NFKC")
    .replaceAll("\\", "/")
    .toLocaleLowerCase();
  const kind = candidate.symbol.kind.normalize("NFKC").toLocaleLowerCase();
  const symbol = candidate.symbol.symbol_id
    .normalize("NFKC")
    .toLocaleLowerCase();
  return (
    `${String(group).padStart(2, "0")}\u0000${path}\u0000` +
    `${kind}\u0000${symbol}`
  );
}

export function rankLandmarks(
  candidates: readonly LandmarkCandidate[],
): ScoredLandmark[] {
  return candidates
    .map((candidate) => ({ candidate, landmark: scoreLandmark(candidate) }))
    .sort(compareRankedLandmarks)
    .map(({ landmark }) => landmark);
}

export function defaultLandmarks(
  candidates: readonly LandmarkCandidate[],
): ScoredLandmark[] {
  return rankLandmarks(candidates).filter((landmark) => landmark.eligible);
}
