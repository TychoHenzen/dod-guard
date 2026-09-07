import type { GraphRelationCandidate } from "./graph-relation-candidate.js";
import type { GraphRelationName } from "./graph-relation-name.js";

export type GraphRelationGroup = {
  relation: GraphRelationName;
  state: "not_loaded" | "loading" | "loaded" | "unavailable" | "failed";
  candidates: readonly GraphRelationCandidate[];
  omitted_count: number;
};
