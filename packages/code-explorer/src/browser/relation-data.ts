import { browserRelationNames } from "../navigation/focus-relation-names.js";
import type { RelationCandidate } from "./relation-candidate.js";
import type { RelationGroup } from "./relation-group.js";
import type { FocusedSource } from "./source.js";

export const browserRelations = browserRelationNames;

export function isBrowserRelation(
  value: string,
): value is (typeof browserRelations)[number] {
  return browserRelations.includes(value as (typeof browserRelations)[number]);
}

export function relationCandidates(
  data: Record<string, unknown>,
): RelationCandidate[] {
  if (Array.isArray(data.candidates))
    return data.candidates as RelationCandidate[];
  if (data.focus && typeof data.focus === "object")
    return [data.focus as RelationCandidate];
  return [];
}

export function relationName(candidate: RelationCandidate): string {
  if (candidate.display_name) return candidate.display_name;
  if (candidate.name) return candidate.name;
  if (candidate.symbol_id) return candidate.symbol_id;
  return "relation";
}

export function relationHandles(
  candidate: RelationCandidate,
): FocusedSource["handles"] {
  return (candidate.handles ?? []).map(({ handle, start, end, relations }) => ({
    handle,
    start,
    end,
    relations: [...relations],
  }));
}

export function graphCandidateMap(
  groups: readonly RelationGroup[],
): Map<string, RelationCandidate> {
  const candidates = new Map<string, RelationCandidate>();
  for (const group of groups) {
    for (const candidate of group.candidates) {
      if (candidate.symbol_id) candidates.set(candidate.symbol_id, candidate);
    }
  }
  return candidates;
}
