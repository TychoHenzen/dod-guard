import { escapeText } from "./escape-text.js";
import type { GraphEdge } from "./graph-edge.js";
import type { GraphLane } from "./graph-lane.js";
import type { GraphPosition } from "./graph-position.js";
import type { OneHopGraph } from "./one-hop-graph.js";

function edgeLane(edge: GraphEdge): GraphLane {
  return edge.label === "caller" || edge.label === "reference"
    ? "incoming"
    : "outgoing";
}
function laneFor(
  node: OneHopGraph["nodes"][number],
  graph: OneHopGraph,
): GraphLane {
  if (node.center) return "center";
  const edge = graph.edges.find(
    (candidate) =>
      candidate.from === node.symbol_id || candidate.to === node.symbol_id,
  );
  return edge ? edgeLane(edge) : "outgoing";
}
function nodePositions(graph: OneHopGraph): ReadonlyMap<string, GraphPosition> {
  const positions = new Map<string, GraphPosition>();
  const rows: Record<GraphLane, number> = {
    incoming: 0,
    center: 0,
    outgoing: 0,
  };
  for (const node of graph.nodes) {
    const lane = laneFor(node, graph);
    rows[lane] += 1;
    const x = lane === "incoming" ? "16%" : lane === "center" ? "50%" : "84%";
    positions.set(node.symbol_id, { lane, x, y: rows[lane] * 48 });
  }
  return positions;
}
function renderEdges(
  graph: OneHopGraph,
  positions: ReadonlyMap<string, GraphPosition>,
): string {
  return graph.edges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!(from && to)) throw new Error("invalid_graph_projection");
      const direction = edgeLane(edge);
      return (
        `<path data-edge-label="${edge.label}" data-direction="${direction}" ` +
        `d="M ${from.x} ${from.y} L ${to.x} ${to.y}" ` +
        `marker-end="url(#graph-arrow)"/>`
      );
    })
    .join("");
}
function renderNodes(
  graph: OneHopGraph,
  positions: ReadonlyMap<string, GraphPosition>,
): string {
  return graph.nodes
    .map((node) => {
      const position = positions.get(node.symbol_id);
      if (!position) throw new Error("invalid_graph_projection");
      const selection = node.selectable
        ? ` data-focus="${escapeText(node.symbol_id)}"`
        : "";
      return (
        `<text data-node-id="${escapeText(node.symbol_id)}" ` +
        `data-lane="${position.lane}" x="${position.x}" y="${position.y}"` +
        `${selection}>${escapeText(node.name)}</text>`
      );
    })
    .join("");
}
function renderOmitted(graph: OneHopGraph): string {
  return [...graph.omitted.entries()]
    .map(
      ([relation, count]) =>
        `<text data-omitted-relation="${relation}">${count} omitted</text>`,
    )
    .join("");
}
/** Renders a deterministic lane-based SVG from one already-derived graph
 * without requesting more relations.
 */
export function renderOneHopGraph(graph: OneHopGraph): string {
  const positions = nodePositions(graph);
  const edgeMarkup = renderEdges(graph, positions);
  const nodeMarkup = renderNodes(graph, positions);
  const omittedMarkup = renderOmitted(graph);
  return (
    '<svg data-graph="one-hop" viewBox="0 0 100 100" role="img">' +
    '<defs><marker id="graph-arrow" markerWidth="4" markerHeight="4" ' +
    'refX="4" refY="2" orient="auto"><path d="M 0 0 L 4 2 L 0 4 z"/>' +
    `</marker></defs>${edgeMarkup}${nodeMarkup}${omittedMarkup}</svg>`
  );
}
