import type {
  BrowserFocusNavigation,
  FocusTarget,
} from "./focus-navigation.js";
import {
  type GraphFocus,
  type GraphNode,
  type GraphRelationGroup,
  type OneHopGraph,
  projectOneHopGraph,
} from "./graph.js";

import type { GraphRelationInput } from "./graph-relation-input.js";
import type { GraphRenderOptions } from "./graph-render-options.js";

export type { GraphRelationInput } from "./graph-relation-input.js";
export type { GraphRenderOptions } from "./graph-render-options.js";
export { renderGraphArea } from "./graph-render-area.js";

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

/** Stores graph data as plain immutable browser-view state, including its
 * stale presentation status.
 */
export function graphSnapshot(
  graph: OneHopGraph,
  stale: boolean,
): Record<string, unknown> {
  return {
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    omitted: [...graph.omitted.entries()],
    stale,
  };
}

export function graphFor(
  focus: GraphFocus,
  groups: readonly GraphRelationInput[],
): OneHopGraph {
  return projectOneHopGraph(focus, toGraphRelationGroups(groups));
}

/** Keeps graph selection on the normal local focus path and denies stale or
 * center-node actions.
 */
export class BrowserGraphController {
  constructor(
    private readonly navigation: BrowserFocusNavigation,
    private readonly isStale: () => boolean,
    private readonly selectTarget: (target: FocusTarget) => Promise<boolean> = (
      target,
    ) => navigation.selectRelation(target),
  ) {}

  async select(node: GraphNode | undefined): Promise<boolean> {
    if (!node?.selectable || this.isStale()) return false;
    const target: FocusTarget = { symbol_id: node.symbol_id };
    return this.selectTarget(target);
  }
}
