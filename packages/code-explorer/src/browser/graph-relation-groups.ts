import type { GraphRelationGroup } from "./graph-relation-group.js";
import type { GraphRelationInput } from "./graph-relation-input.js";

function graphName(
  candidate: GraphRelationInput["candidates"][number],
): string {
  if (candidate.name) return candidate.name;
  if (candidate.display_name) return candidate.display_name;
  return candidate.symbol_id ?? "";
}

/** Converts the loaded browser relation representation into the graph's
 * verified local semantic input.
 */
export function toGraphRelationGroups(
  groups: readonly GraphRelationInput[],
): GraphRelationGroup[] {
  return groups.map((group) => ({
    relation:
      group.relation === "implementation" ? "implementations" : group.relation,
    state: group.state,
    omitted_count: group.omitted_count,
    candidates: group.candidates.flatMap((candidate) =>
      candidate.symbol_id
        ? [
            {
              symbol_id: candidate.symbol_id,
              name: graphName(candidate),
              external: candidate.external,
              discovery_only: candidate.discovery_only,
            },
          ]
        : [],
    ),
  }));
}
