import type { RelationCandidate } from "./relation-candidate.js";

export function displayName(candidate: RelationCandidate): string {
  if (candidate.name) return candidate.name;
  if (candidate.display_name) return candidate.display_name;
  return candidate.symbol_id ?? "";
}
