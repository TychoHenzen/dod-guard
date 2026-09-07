import type { BrowserFocusNavigation } from "./focus-navigation.js";
import { BrowserRelationsController } from "./relation-controller.js";
import { browserRelations } from "./relation-data.js";
import { navigateRelationCandidate } from "./relation-target-navigation.js";
import {
  createRelationController,
} from "./relation-pane-controller-support.js";
import {
  renderRelationChoices,
  renderRelationGroup,
  resetRelationPane,
} from "./relation-pane-render.js";
import type { BrowserStorage } from "./session.js";
import type { FocusedSource } from "./source.js";
export class RelationPaneController {
  private readonly relationControllers = new Map<
    string,
    BrowserRelationsController
  >();
  private activeRelationKey: string | undefined;
  private latestRelationRequest: object = {};

  constructor(
    private readonly storage: BrowserStorage,
    private readonly navigation: BrowserFocusNavigation,
    private readonly renderGraph: (
      source: FocusedSource,
      controller?: BrowserRelationsController,
    ) => void,
    private readonly onSelection: (selected: boolean) => void,
  ) {}

  reset(): void {
    this.activeRelationKey = undefined;
    this.latestRelationRequest = {};
    resetRelationPane();
  }

  showRelationChoices(
    source: FocusedSource,
    handle: FocusedSource["handles"][number],
  ): void {
    const controller = this.relationController(source, handle);
    this.activeRelationKey = `${source.view_id}:${handle.handle}`;
    this.latestRelationRequest = {};
    const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
    if (!pane) return;
    renderRelationChoices(
      pane,
      handle,
      (relation) => void this.openRelation(source, handle, relation),
    );
    this.renderGraph(source, controller);
  }

  private async openRelation(
    source: FocusedSource,
    handle: FocusedSource["handles"][number],
    relation: (typeof browserRelations)[number],
  ): Promise<void> {
    const controller = this.relationController(source, handle);
    const request = {};
    this.latestRelationRequest = request;
    const group = await controller.open(relation);
    if (
      this.latestRelationRequest !== request ||
      this.navigation.state().focus?.view_id !== source.view_id
    )
      return;
    renderRelationGroup({
      source,
      activeRelationKey: this.activeRelationKey,
      relation,
      group,
      select: (candidate) => this.selectCandidate(candidate),
    });
    this.renderGraph(source, controller);
  }

  private relationController(
    source: FocusedSource,
    handle: FocusedSource["handles"][number],
  ): BrowserRelationsController {
    const key = `${source.view_id}:${handle.handle}`;
    const existing = this.relationControllers.get(key);
    if (existing) return existing;
    const controller = createRelationController(this.storage, source, handle);
    this.relationControllers.set(key, controller);
    return controller;
  }

  private selectCandidate(
    candidate: Parameters<typeof navigateRelationCandidate>[1],
  ): void {
    void navigateRelationCandidate(this.navigation, candidate).then(
      (selected) => this.onSelection(selected),
    );
  }
}
