import { showActionStatus } from "./application-events.js";
import type { BrowserFocusNavigation } from "./focus-navigation.js";
import { RelationGraphView } from "./relation-graph-view.js";
import { RelationPaneController } from "./relation-pane-controller.js";
import type { BrowserStorage } from "./session.js";
import type { FocusedSource } from "./source.js";
import { renderFocusedSource } from "./source.js";

/** Owns relation, graph, and immutable relation-target view rendering for the
 * browser shell.
 */
export class BrowserRelationView {
  private readonly graphView: RelationGraphView;
  private readonly paneController: RelationPaneController;

  constructor(
    storage: BrowserStorage,
    private readonly navigation: BrowserFocusNavigation,
  ) {
    this.graphView = new RelationGraphView(navigation, (selected) =>
      this.finishSelection(selected),
    );
    this.paneController = new RelationPaneController(
      storage,
      navigation,
      (source, controller) => this.graphView.render(source, controller),
      (selected) => this.finishSelection(selected),
    );
  }

  renderFocusedView(): void {
    const source = this.navigation.state().focus?.source;
    if (!source) return;
    const host = document.querySelector<HTMLElement>('[data-area="source"]');
    if (host) host.innerHTML = renderFocusedSource(source);
    this.bindSourceRelations(source);
    this.paneController.reset();
    this.graphView.render(source);
  }

  private bindSourceRelations(source: FocusedSource): void {
    for (const mark of document.querySelectorAll<HTMLElement>(
      "mark[data-handle]",
    )) {
      mark.addEventListener("click", () => {
        const handle = source.handles.find(
          (candidate) => candidate.handle === mark.dataset.handle,
        );
        if (handle) this.paneController.showRelationChoices(source, handle);
      });
    }
  }

  private finishSelection(selected: boolean): void {
    if (selected) {
      this.renderFocusedView();
      showActionStatus("ready");
      return;
    }
    showActionStatus(this.navigation.state().error ?? "backend_unavailable");
  }
}
