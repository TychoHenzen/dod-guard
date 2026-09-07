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
import { toGraphRelationGroups } from "./graph-relation-groups.js";
import type { GraphRelationInput } from "./graph-relation-input.js";

export { toGraphRelationGroups } from "./graph-relation-groups.js";

export type { GraphRelationInput } from "./graph-relation-input.js";
export { renderGraphArea } from "./graph-render-area.js";
export type { GraphRenderOptions } from "./graph-render-options.js";

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
