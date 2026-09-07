import type { GraphEdge } from "./graph-edge.js";
import type { GraphNode } from "./graph-node.js";
import type { GraphRelationName } from "./graph-relation-name.js";

export type OneHopGraph = {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  omitted: ReadonlyMap<GraphRelationName, number>;
};
