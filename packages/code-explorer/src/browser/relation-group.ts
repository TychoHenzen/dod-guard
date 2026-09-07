import type { RelationCandidate } from "./relation-candidate.js";
import type { RelationName } from "./relation-name.js";

export type RelationGroup = {
  relation: RelationName;
  state: "not_loaded" | "loading" | "loaded" | "unavailable" | "failed";
  candidates: readonly RelationCandidate[];
  omitted_count: number;
};
