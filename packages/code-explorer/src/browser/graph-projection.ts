import type { GraphEdge } from "./graph-edge.js";
import type { GraphFocus } from "./graph-focus.js";
import type { GraphNode } from "./graph-node.js";
import type { GraphRelationGroup } from "./graph-relation-group.js";
import type { GraphRelationName } from "./graph-relation-name.js";
import type { OneHopGraph } from "./one-hop-graph.js";
import { addGroup, normalizedIdentity } from "./graph-projection-edges.js";

const relationOrder: readonly GraphRelationName[] = [
  "definition",
  "references",
  "callers",
  "callees",
  "type",
  "implementations",
];

/** Derives a graph only from local candidates already loaded by the owning
 * view.
 */
export function projectOneHopGraph(
  focus: GraphFocus,
  groups: readonly GraphRelationGroup[],
): OneHopGraph {
  const focusId = normalizedIdentity(focus.symbol_id);
  if (focusId.length === 0) throw new Error("invalid_graph_focus");
  const nodes = new Map<string, GraphNode>([
    [
      focusId,
      { symbol_id: focusId, name: focus.name, center: true, selectable: false },
    ],
  ]);
  const edges: GraphEdge[] = [];
  const omitted = new Map<GraphRelationName, number>();
  const byRelation = new Map(groups.map((group) => [group.relation, group]));
  for (const relation of relationOrder) {
    const group = byRelation.get(relation);
    if (group?.state === "loaded")
      addGroup({ group, focusId, nodes, edges, omitted });
  }
  return { nodes: [...nodes.values()], edges, omitted };
}
