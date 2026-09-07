import type {
  BrowserFocusNavigation,
  FocusTarget,
} from "./focus-navigation.js";
import {
  BrowserGraphController,
  graphFor,
  renderGraphArea,
} from "./graph-navigation.js";
import type { RelationCandidate } from "./relation-candidate.js";
import type { BrowserRelationsController } from "./relation-controller.js";
import { browserRelations, graphCandidateMap } from "./relation-data.js";
import { navigateRelationCandidate } from "./relation-target-navigation.js";
import type { FocusedSource } from "./source.js";

export class RelationGraphView {
  private readonly graphController: BrowserGraphController;
  private graphCandidates = new Map<string, RelationCandidate>();

  constructor(
    private readonly navigation: BrowserFocusNavigation,
    private readonly onSelection: (selected: boolean) => void,
  ) {
    this.graphController = new BrowserGraphController(
      navigation,
      () => false,
      (target) => this.navigateTarget(target),
    );
  }

  render(source: FocusedSource, controller?: BrowserRelationsController): void {
    const host = document.querySelector<HTMLElement>('[data-area="graph"]');
    if (!host) return;
    const groups = controller
      ? browserRelations.map((relation) => controller.state(relation))
      : [];
    this.graphCandidates = graphCandidateMap(groups);
    const graph = graphFor(
      { symbol_id: source.symbol.symbol_id, name: source.symbol.name },
      groups,
    );
    host.outerHTML = renderGraphArea(graph);
    this.bindGraphNodes(graph);
  }

  private bindGraphNodes(graph: ReturnType<typeof graphFor>): void {
    const rendered = document.querySelector<HTMLElement>('[data-area="graph"]');
    for (const node of rendered?.querySelectorAll<HTMLElement>(
      "[data-focus]",
    ) ?? []) {
      const graphNode = graph.nodes.find(
        (candidate) => candidate.symbol_id === node.dataset.focus,
      );
      node.addEventListener(
        "click",
        () =>
          void this.graphController
            .select(graphNode)
            .then((selected) => this.finishSelection(selected)),
      );
    }
  }

  private finishSelection(selected: boolean): void {
    this.onSelection(selected);
  }

  private navigateTarget(target: FocusTarget): Promise<boolean> {
    const candidate = this.graphCandidates.get(target.symbol_id);
    return candidate
      ? navigateRelationCandidate(this.navigation, candidate)
      : this.navigation.selectRelation(target);
  }
}
