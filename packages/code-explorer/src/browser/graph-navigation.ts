import type { BrowserFocusNavigation, FocusTarget } from "./focus-navigation.js";
import {
  type GraphFocus,
  type GraphNode,
  type GraphRelationGroup,
  type OneHopGraph,
  projectOneHopGraph,
  renderOneHopGraph,
} from "./graph.js";
import type { RelationGroup } from "./relations.js";

export type GraphRenderOptions = { stale?: boolean; collapsed?: boolean };

function graphName(candidate: RelationGroup["candidates"][number]): string {
  return candidate.name ?? candidate.display_name ?? candidate.symbol_id ?? "";
}

/** Converts the loaded browser relation representation into the graph's verified local semantic input. */
export function toGraphRelationGroups(groups: readonly RelationGroup[]): GraphRelationGroup[] {
  return groups.map((group) => ({
    relation: group.relation,
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

/** Stores graph data as plain immutable browser-view state, including its stale presentation status. */
export function graphSnapshot(graph: OneHopGraph, stale: boolean): Record<string, unknown> {
  return {
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    omitted: [...graph.omitted.entries()],
    stale,
  };
}

/** Keeps graph selection on the normal local focus path and denies stale or center-node actions. */
export class BrowserGraphController {
  constructor(
    private readonly navigation: BrowserFocusNavigation,
    private readonly isStale: () => boolean,
  ) {}

  graphFor(focus: GraphFocus, groups: readonly RelationGroup[]): OneHopGraph {
    return projectOneHopGraph(focus, toGraphRelationGroups(groups));
  }

  async select(node: GraphNode | undefined): Promise<boolean> {
    if (!node?.selectable || this.isStale()) return false;
    const target: FocusTarget = { symbol_id: node.symbol_id };
    return this.navigation.selectRelation(target);
  }
}

/** Contains invalid graph data or layout failures to the SVG area. */
export function renderGraphArea(graph: OneHopGraph, options: GraphRenderOptions = {}): string {
  if (options.collapsed) return '<section data-area="graph" data-state="collapsed">collapsed</section>';
  try {
    const svg = renderOneHopGraph(graph);
    if (options.stale) return `<section data-area="graph" data-state="stale">stale${svg}</section>`;
    return `<section data-area="graph" data-state="ready">${svg}</section>`;
  } catch {
    return '<section data-area="graph" data-state="failed">graph_render_failed</section>';
  }
}
