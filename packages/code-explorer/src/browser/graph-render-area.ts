import type { OneHopGraph } from "./one-hop-graph.js";
import type { GraphRenderOptions } from "./graph-render-options.js";
import { renderOneHopGraph } from "./graph.js";

/** Contains invalid graph data or layout failures to the SVG area. */
export function renderGraphArea(
  graph: OneHopGraph,
  options: GraphRenderOptions = {},
): string {
  if (options.collapsed)
    return (
      '<section data-area="graph" data-state="collapsed">collapsed</section>'
    );
  try {
    const svg = renderOneHopGraph(graph);
    if (options.stale)
      return `<section data-area="graph" data-state="stale">` +
        `stale${svg}</section>`;
    return `<section data-area="graph" data-state="ready">` +
      `${svg}</section>`;
  } catch {
    return (
      '<section data-area="graph" data-state="failed">' +
      'graph_render_failed</section>'
    );
  }
}
