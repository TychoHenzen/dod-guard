import { renderOneHopGraph } from "./graph.js";
import type { GraphRenderOptions } from "./graph-render-options.js";
import type { OneHopGraph } from "./one-hop-graph.js";

/** Contains invalid graph data or layout failures to the SVG area. */
export function renderGraphArea(
  graph: OneHopGraph,
  options: GraphRenderOptions = {},
): string {
  if (options.collapsed) return graphSection("collapsed", "collapsed");
  try {
    const svg = renderOneHopGraph(graph);
    if (options.stale) return graphSection("stale", `stale${svg}`);
    return graphSection("ready", svg);
  } catch {
    return graphSection("failed", "graph_render_failed");
  }
}

function graphSection(state: string, content: string): string {
  const attributes = `data-area="graph" data-state="${state}"`;
  return `<section ${attributes}>${content}</section>`;
}
