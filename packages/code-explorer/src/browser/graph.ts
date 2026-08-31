export type GraphRelationName = "definition" | "references" | "callers" | "callees" | "type" | "implementations";

export type GraphFocus = {
  symbol_id: string;
  name: string;
};

export type GraphRelationCandidate = {
  symbol_id: string;
  name: string;
  external?: boolean;
  discovery_only?: boolean;
  known_relations?: readonly string[];
};

export type GraphRelationGroup = {
  relation: GraphRelationName;
  state: "not_loaded" | "loading" | "loaded" | "unavailable" | "failed";
  candidates: readonly GraphRelationCandidate[];
  omitted_count: number;
};

export type GraphNode = {
  symbol_id: string;
  name: string;
  center: boolean;
};

export type GraphEdge = {
  from: string;
  to: string;
  label: "definition" | "reference" | "caller" | "callee" | "type" | "implementation";
};

export type OneHopGraph = {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  omitted: ReadonlyMap<GraphRelationName, number>;
};

type GraphLane = "incoming" | "center" | "outgoing";
type GraphPosition = { lane: GraphLane; x: "16%" | "50%" | "84%"; y: number };

const relationOrder: readonly GraphRelationName[] = [
  "definition",
  "references",
  "callers",
  "callees",
  "type",
  "implementations",
];

const relationLabel: Readonly<Record<GraphRelationName, GraphEdge["label"]>> = {
  definition: "definition",
  references: "reference",
  callers: "caller",
  callees: "callee",
  type: "type",
  implementations: "implementation",
};

function normalizedIdentity(symbol_id: string): string {
  return symbol_id.trim().normalize("NFC");
}

function isLocalSemanticCandidate(candidate: GraphRelationCandidate): boolean {
  return (
    candidate.external !== true &&
    candidate.discovery_only !== true &&
    normalizedIdentity(candidate.symbol_id).length > 0
  );
}

function edgeFor(relation: GraphRelationName, candidate: GraphRelationCandidate, focusId: string): GraphEdge {
  const candidateId = normalizedIdentity(candidate.symbol_id);
  const incoming = relation === "references" || relation === "callers";
  return {
    from: incoming ? candidateId : focusId,
    to: incoming ? focusId : candidateId,
    label: relationLabel[relation],
  };
}

/** Derives a graph only from local candidates already loaded by the owning view. */
export function projectOneHopGraph(focus: GraphFocus, groups: readonly GraphRelationGroup[]): OneHopGraph {
  const focusId = normalizedIdentity(focus.symbol_id);
  if (focusId.length === 0) throw new Error("invalid_graph_focus");
  const nodes = new Map<string, GraphNode>([[focusId, { symbol_id: focusId, name: focus.name, center: true }]]);
  const edges: GraphEdge[] = [];
  const omitted = new Map<GraphRelationName, number>();
  const byRelation = new Map(groups.map((group) => [group.relation, group]));

  for (const relation of relationOrder) {
    const group = byRelation.get(relation);
    if (group?.state !== "loaded") continue;
    if (group.omitted_count > 0) omitted.set(relation, group.omitted_count);
    for (const candidate of group.candidates) {
      if (!isLocalSemanticCandidate(candidate)) continue;
      const symbol_id = normalizedIdentity(candidate.symbol_id);
      if (!nodes.has(symbol_id)) nodes.set(symbol_id, { symbol_id, name: candidate.name, center: false });
      edges.push(edgeFor(relation, candidate, focusId));
    }
  }

  return { nodes: [...nodes.values()], edges, omitted };
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function edgeLane(edge: GraphEdge): GraphLane {
  return edge.label === "caller" || edge.label === "reference" ? "incoming" : "outgoing";
}

function nodePositions(graph: OneHopGraph): ReadonlyMap<string, GraphPosition> {
  const positions = new Map<string, GraphPosition>();
  const rows: Record<GraphLane, number> = { incoming: 0, center: 0, outgoing: 0 };
  for (const node of graph.nodes) {
    const firstEdge = graph.edges.find((edge) => edge.from === node.symbol_id || edge.to === node.symbol_id);
    const lane = node.center ? "center" : firstEdge ? edgeLane(firstEdge) : "outgoing";
    rows[lane] += 1;
    positions.set(node.symbol_id, {
      lane,
      x: lane === "incoming" ? "16%" : lane === "center" ? "50%" : "84%",
      y: rows[lane] * 48,
    });
  }
  return positions;
}

/** Renders a deterministic lane-based SVG from one already-derived graph without requesting more relations. */
export function renderOneHopGraph(graph: OneHopGraph): string {
  const positions = nodePositions(graph);
  const edgeMarkup = graph.edges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!(from && to)) throw new Error("invalid_graph_projection");
      const direction = edgeLane(edge);
      return `<path data-edge-label="${edge.label}" data-direction="${direction}" d="M ${from.x} ${from.y} L ${to.x} ${to.y}" marker-end="url(#graph-arrow)"/>`;
    })
    .join("");
  const nodeMarkup = graph.nodes
    .map((node) => {
      const position = positions.get(node.symbol_id);
      if (!position) throw new Error("invalid_graph_projection");
      return `<text data-node-id="${escapeText(node.symbol_id)}" data-lane="${position.lane}" x="${position.x}" y="${position.y}">${escapeText(node.name)}</text>`;
    })
    .join("");
  const omittedMarkup = [...graph.omitted.entries()]
    .map(([relation, count]) => `<text data-omitted-relation="${relation}">${count} omitted</text>`)
    .join("");
  return `<svg data-graph="one-hop" viewBox="0 0 100 100" role="img"><defs><marker id="graph-arrow" markerWidth="4" markerHeight="4" refX="4" refY="2" orient="auto"><path d="M 0 0 L 4 2 L 0 4 z"/></marker></defs>${edgeMarkup}${nodeMarkup}${omittedMarkup}</svg>`;
}
