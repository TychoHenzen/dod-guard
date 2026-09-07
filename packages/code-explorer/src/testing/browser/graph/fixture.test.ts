import type { GraphRelationGroup } from "../../../browser/graph.js";
import type { GraphRelationInput } from "../../../browser/graph-navigation.js";

export const focus = { symbol_id: "project::Focus", name: "Focus" };

export function loaded(
  relation: GraphRelationGroup["relation"],
  candidates: GraphRelationGroup["candidates"],
  omittedCount = 0,
): GraphRelationGroup {
  return { relation, state: "loaded", candidates, omitted_count: omittedCount };
}

export function browserGroup(
  relation: GraphRelationInput["relation"],
  candidates: GraphRelationInput["candidates"],
  omittedCount = 0,
): GraphRelationInput {
  return { relation, state: "loaded", candidates, omitted_count: omittedCount };
}
