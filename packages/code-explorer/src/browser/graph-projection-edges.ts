import type { GraphEdge } from "./graph-edge.js";
import type { GraphNode } from "./graph-node.js";
import type { GraphRelationCandidate } from "./graph-relation-candidate.js";
import type { GraphRelationGroup } from "./graph-relation-group.js";
import type { GraphRelationName } from "./graph-relation-name.js";

const relationLabel: Readonly<Record<GraphRelationName, GraphEdge["label"]>> = {
  definition: "definition",
  references: "reference",
  callers: "caller",
  callees: "callee",
  type: "type",
  implementations: "implementation",
};

export function normalizedIdentity(symbolId: string): string {
  return symbolId.trim().normalize("NFC");
}

function isLocalCandidate(candidate: GraphRelationCandidate): boolean {
  return candidate.external !== true && candidate.discovery_only !== true;
}

function edgeFor(
  relation: GraphRelationName,
  candidateId: string,
  focusId: string,
): GraphEdge {
  const incoming = relation === "references" || relation === "callers";
  return {
    from: incoming ? candidateId : focusId,
    to: incoming ? focusId : candidateId,
    label: relationLabel[relation],
  };
}

export function addGroup(options: {
  group: GraphRelationGroup;
  focusId: string;
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  omitted: Map<GraphRelationName, number>;
}): void {
  const { group, focusId, nodes, edges, omitted } = options;
  if (group.omitted_count > 0) omitted.set(group.relation, group.omitted_count);
  for (const candidate of group.candidates) {
    addCandidate({
      candidate,
      relation: group.relation,
      focusId,
      nodes,
      edges,
    });
  }
}

function addCandidate(options: {
  candidate: GraphRelationCandidate;
  relation: GraphRelationName;
  focusId: string;
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}): void {
  const { candidate, relation, focusId, nodes, edges } = options;
  const symbolId = normalizedIdentity(candidate.symbol_id);
  if (!isLocalCandidate(candidate) || symbolId.length === 0) return;
  if (!nodes.has(symbolId))
    nodes.set(symbolId, {
      symbol_id: symbolId,
      name: candidate.name,
      center: false,
      selectable: true,
    });
  edges.push(edgeFor(relation, symbolId, focusId));
}
