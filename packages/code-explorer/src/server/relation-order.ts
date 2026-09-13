import type { FollowCandidate } from "./relation-candidate.js";

export function compareRelationCandidates(
  left: FollowCandidate,
  right: FollowCandidate,
): number {
  if (left.external !== right.external) return left.external ? 1 : -1;
  return relationCandidateSortKey(left).localeCompare(
    relationCandidateSortKey(right),
  );
}

function relationCandidateSortKey(candidate: FollowCandidate): string {
  return [
    candidate.path ?? "",
    relationPositionKey(candidate.range),
    candidate.kind ?? "",
    relationIdentityKey(candidate),
  ].join("\u0000");
}

function relationPositionKey(range: FollowCandidate["range"]): string {
  if (!range) return "0\u00000";
  return `${range.start.line}\u0000${range.start.character}`;
}

function relationIdentityKey(candidate: FollowCandidate): string {
  if (candidate.symbol_id !== undefined) return candidate.symbol_id;
  return candidate.display_name ?? "";
}
