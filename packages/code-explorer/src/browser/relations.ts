import type { FocusHandle } from "../navigation/focus-view.js";
import { showActionStatus } from "./application-events.js";
import { browserRequest } from "./browser-request.js";
import type { BrowserFocus, BrowserFocusNavigation, FocusTarget } from "./focus-navigation.js";
import { BrowserGraphController, renderGraphArea } from "./graph-navigation.js";
import type { BrowserStorage } from "./session.js";
import { type FocusedSource, renderFocusedSource } from "./source.js";

export type RelationName =
  | "definition"
  | "references"
  | "callers"
  | "callees"
  | "type"
  | "implementation"
  | "implementations";
export type RelationCandidate = {
  /** Browser adapter preserves the core's normalized local identity for graph projection. */
  symbol_id?: string;
  /** Older browser fixtures use `name`; runtime follow replies use `display_name`. */
  name?: string;
  display_name?: string;
  external: boolean;
  discovery_only?: boolean;
  local_handle?: string;
  view_id?: string;
  handle?: string;
  handles?: readonly FocusHandle[];
  content?: {
    body?: string;
    declaration?: string;
    truncated?: boolean;
    limit_bytes?: number;
    returned_bytes?: number;
    total_bytes?: number;
  };
  path?: string;
  kind?: string;
  project_generation?: number;
};
export type RelationReply = {
  state: string;
  project_generation?: number;
  data?: { candidates?: readonly RelationCandidate[]; omitted_count?: number };
};
type RelationGroup = {
  relation: RelationName;
  state: "not_loaded" | "loading" | "loaded" | "unavailable" | "failed";
  candidates: readonly RelationCandidate[];
  omitted_count: number;
};

type RelationContext = {
  view_id: string;
  handle: string;
  supported: readonly RelationName[];
  unavailable: readonly RelationName[];
};

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayName(candidate: RelationCandidate): string {
  return candidate.name ?? candidate.display_name ?? candidate.symbol_id ?? "";
}

function preserveGeneration(candidate: RelationCandidate, generation: number | undefined): RelationCandidate {
  if (candidate.project_generation !== undefined || generation === undefined) return candidate;
  return { ...candidate, project_generation: generation };
}

/** Stores relation data by the immutable focus view and dispatches no follow request until a group opens. */
export class BrowserRelationsController {
  private readonly groups = new Map<RelationName, RelationGroup>();
  private readonly pending = new Map<RelationName, Promise<RelationGroup>>();

  constructor(
    private readonly context: RelationContext,
    private readonly follow: (request: {
      view_id: string;
      handle: string;
      relation: RelationName;
      limit: number;
    }) => Promise<RelationReply>,
  ) {
    for (const relation of context.supported)
      this.groups.set(relation, { relation, state: "not_loaded", candidates: [], omitted_count: 0 });
    for (const relation of context.unavailable)
      this.groups.set(relation, { relation, state: "unavailable", candidates: [], omitted_count: 0 });
  }

  state(relation: RelationName): RelationGroup {
    return this.groups.get(relation) ?? { relation, state: "unavailable", candidates: [], omitted_count: 0 };
  }

  async open(relation: RelationName): Promise<RelationGroup> {
    const current = this.state(relation);
    if (current.state === "unavailable" || current.state === "loaded") return current;
    const active = this.pending.get(relation);
    if (active) return active;
    this.groups.set(relation, { ...current, state: "loading" });
    const request = this.load(relation);
    this.pending.set(relation, request);
    try {
      return await request;
    } finally {
      this.pending.delete(relation);
    }
  }

  private async load(relation: RelationName): Promise<RelationGroup> {
    try {
      const reply = await this.follow({
        view_id: this.context.view_id,
        handle: this.context.handle,
        relation,
        limit: 200,
      });
      if (reply.state !== "ok") return this.save({ relation, state: "failed", candidates: [], omitted_count: 0 });
      return this.save({
        relation,
        state: "loaded",
        candidates: (reply.data?.candidates ?? []).map((candidate) =>
          preserveGeneration(candidate, reply.project_generation),
        ),
        omitted_count: reply.data?.omitted_count ?? 0,
      });
    } catch {
      return this.save({ relation, state: "failed", candidates: [], omitted_count: 0 });
    }
  }

  private save(group: RelationGroup): RelationGroup {
    this.groups.set(group.relation, group);
    return group;
  }
}

/** Renders only local candidates as focusable rows. External candidates expose display identity without source-derived detail. */
export function renderRelationGroup(group: RelationGroup): string {
  if (group.state !== "loaded")
    return `<section data-relation="${group.relation}" data-state="${group.state}">${group.state}</section>`;
  if (group.candidates.length === 0)
    return `<section data-relation="${group.relation}" data-state="empty">empty</section>`;
  const rows = group.candidates
    .map((candidate) => {
      const name = escapeText(displayName(candidate));
      if (candidate.external) return `<li data-external="true">${name}</li>`;
      return `<li data-focus="${escapeText(candidate.local_handle ?? "")}">${name}</li>`;
    })
    .join("");
  const omitted = group.omitted_count > 0 ? `<p>${group.omitted_count} omitted</p>` : "";
  return `<section data-relation="${group.relation}" data-state="loaded"><ul>${rows}</ul>${omitted}</section>`;
}

const browserRelations = ["definition", "references", "callers", "callees", "type", "implementation"] as const;

function isBrowserRelation(value: string): value is (typeof browserRelations)[number] {
  return browserRelations.includes(value as (typeof browserRelations)[number]);
}

function relationFocus(candidate: RelationCandidate): BrowserFocus | undefined {
  if (!hasFocusPayload(candidate)) return;
  const body = relationBody(candidate.content);
  if (typeof body !== "string") return;
  const returnedBytes = relationReturnedBytes(candidate.content, body);
  const totalBytes = relationTotalBytes(candidate.content, returnedBytes);
  const handles = relationHandles(candidate);
  const source: FocusedSource = {
    view_id: candidate.view_id,
    symbol: {
      name: relationName(candidate),
      kind: candidate.kind,
      path: candidate.path,
      symbol_id: candidate.symbol_id,
    },
    generation: relationGeneration(candidate),
    body,
    handles,
    returned_bytes: returnedBytes,
    total_bytes: totalBytes,
    limit_bytes: relationLimit(candidate.content, totalBytes),
    truncated: candidate.content.truncated === true,
  };
  return { view_id: source.view_id, symbol_id: source.symbol.symbol_id, name: source.symbol.name, source };
}

function relationBody(content: NonNullable<RelationCandidate["content"]>): string | undefined {
  if (typeof content.body === "string") return content.body;
  return typeof content.declaration === "string" ? content.declaration : undefined;
}

function relationReturnedBytes(content: NonNullable<RelationCandidate["content"]>, body: string): number {
  if (typeof content.returned_bytes === "number") return content.returned_bytes;
  return new TextEncoder().encode(body).byteLength;
}

function relationTotalBytes(content: NonNullable<RelationCandidate["content"]>, returnedBytes: number): number {
  return typeof content.total_bytes === "number" ? content.total_bytes : returnedBytes;
}

function relationLimit(content: NonNullable<RelationCandidate["content"]>, totalBytes: number): number {
  return typeof content.limit_bytes === "number" ? content.limit_bytes : totalBytes;
}

function relationGeneration(candidate: RelationCandidate): number {
  return typeof candidate.project_generation === "number" ? candidate.project_generation : 0;
}

function hasFocusPayload(candidate: RelationCandidate): candidate is RelationCandidate & {
  view_id: string;
  symbol_id: string;
  path: string;
  kind: string;
  content: NonNullable<RelationCandidate["content"]>;
} {
  return Boolean(candidate.view_id && candidate.symbol_id && candidate.path && candidate.kind && candidate.content);
}

function relationName(candidate: RelationCandidate): string {
  if (candidate.display_name) return candidate.display_name;
  if (candidate.name) return candidate.name;
  if (candidate.symbol_id) return candidate.symbol_id;
  return "relation";
}

function relationHandles(candidate: RelationCandidate): FocusedSource["handles"] {
  return (candidate.handles ?? []).map(({ handle, start, end, relations }) => ({
    handle,
    start,
    end,
    relations: [...relations],
  }));
}

function relationCandidates(data: Record<string, unknown>): RelationCandidate[] {
  if (Array.isArray(data.candidates)) return data.candidates as RelationCandidate[];
  if (data.focus && typeof data.focus === "object") return [data.focus as RelationCandidate];
  return [];
}

function graphCandidateMap(groups: readonly RelationGroup[]): Map<string, RelationCandidate> {
  const candidates = new Map<string, RelationCandidate>();
  for (const group of groups) {
    for (const candidate of group.candidates) {
      if (candidate.symbol_id) candidates.set(candidate.symbol_id, candidate);
    }
  }
  return candidates;
}

function textElement(tag: "h2" | "p", text: string): HTMLElement {
  return Object.assign(document.createElement(tag), { textContent: text });
}

/** Owns relation, graph, and immutable relation-target view rendering for the browser shell. */
export class BrowserRelationView {
  private readonly relationControllers = new Map<string, BrowserRelationsController>();
  private readonly graphController: BrowserGraphController;
  private activeRelationKey: string | undefined;
  private latestRelationRequest: object = {};
  private graphCandidates = new Map<string, RelationCandidate>();

  constructor(
    private readonly storage: BrowserStorage,
    private readonly navigation: BrowserFocusNavigation,
  ) {
    this.graphController = new BrowserGraphController(
      navigation,
      () => false,
      (target) => this.navigateTarget(target),
    );
  }

  renderFocusedView(): void {
    const source = this.navigation.state().focus?.source;
    if (!source) return;
    const host = document.querySelector<HTMLElement>('[data-area="source"]');
    if (host) host.innerHTML = renderFocusedSource(source);
    this.bindSourceRelations(source);
    this.resetRelations();
    this.renderGraph(source);
  }

  private bindSourceRelations(source: FocusedSource): void {
    for (const mark of document.querySelectorAll<HTMLElement>("mark[data-handle]")) {
      mark.addEventListener("click", () => {
        const handle = source.handles.find((candidate) => candidate.handle === mark.dataset.handle);
        if (handle) this.showRelationChoices(source, handle);
      });
    }
  }

  private resetRelations(): void {
    this.activeRelationKey = undefined;
    this.latestRelationRequest = {};
    const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
    if (!pane) return;
    pane.dataset.state = "empty";
    pane.replaceChildren(textElement("h2", "Relations"), textElement("p", "No relations loaded"));
  }

  private renderGraph(source: FocusedSource, controller?: BrowserRelationsController): void {
    const host = document.querySelector<HTMLElement>('[data-area="graph"]');
    if (!host) return;
    const groups = controller ? browserRelations.map((relation) => controller.state(relation)) : [];
    this.graphCandidates = graphCandidateMap(groups);
    const graph = this.graphController.graphFor(
      { symbol_id: source.symbol.symbol_id, name: source.symbol.name },
      groups,
    );
    host.outerHTML = renderGraphArea(graph);
    this.bindGraphNodes(graph);
  }

  private bindGraphNodes(graph: ReturnType<BrowserGraphController["graphFor"]>): void {
    const rendered = document.querySelector<HTMLElement>('[data-area="graph"]');
    for (const node of rendered?.querySelectorAll<HTMLElement>("[data-focus]") ?? []) {
      const graphNode = graph.nodes.find((candidate) => candidate.symbol_id === node.dataset.focus);
      node.addEventListener(
        "click",
        () => void this.graphController.select(graphNode).then((selected) => this.finishSelection(selected)),
      );
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

  private navigateTarget(target: FocusTarget): Promise<boolean> {
    const candidate = this.graphCandidates.get(target.symbol_id);
    return candidate ? this.navigateCandidate(candidate) : this.navigation.selectRelation(target);
  }

  private navigateCandidate(candidate: RelationCandidate): Promise<boolean> {
    const focus = relationFocus(candidate);
    if (focus) return Promise.resolve(this.navigation.selectView(focus));
    if (candidate.symbol_id) return this.navigation.selectRelation({ symbol_id: candidate.symbol_id });
    return Promise.resolve(false);
  }

  private relationController(
    source: FocusedSource,
    handle: FocusedSource["handles"][number],
  ): BrowserRelationsController {
    const key = `${source.view_id}:${handle.handle}`;
    const existing = this.relationControllers.get(key);
    if (existing) return existing;
    const supported = handle.relations.filter(isBrowserRelation);
    const controller = new BrowserRelationsController(
      {
        view_id: source.view_id,
        handle: handle.handle,
        supported,
        unavailable: browserRelations.filter((relation) => !supported.includes(relation)),
      },
      (request) => this.follow(request),
    );
    this.relationControllers.set(key, controller);
    return controller;
  }

  private async follow(request: {
    view_id: string;
    handle: string;
    relation: RelationName;
    limit: number;
  }): Promise<RelationReply> {
    const reply = await browserRequest(this.storage, "api/follow", {
      request_id: crypto.randomUUID(),
      ...request,
    });
    const data = Object(reply.data) as Record<string, unknown>;
    return {
      state: reply.state === "unavailable_relation" ? reply.state : "ok",
      project_generation: reply.project_generation,
      data: {
        candidates: relationCandidates(data),
        omitted_count: typeof data.omitted_count === "number" ? data.omitted_count : 0,
      },
    };
  }

  private showRelationChoices(source: FocusedSource, handle: FocusedSource["handles"][number]): void {
    const controller = this.relationController(source, handle);
    this.activeRelationKey = `${source.view_id}:${handle.handle}`;
    this.latestRelationRequest = {};
    const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
    if (!pane) return;
    pane.dataset.state = "empty";
    pane.replaceChildren(textElement("h2", "Relations"));
    for (const relation of handle.relations.filter(isBrowserRelation)) {
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: relation });
      button.dataset.relation = relation;
      button.addEventListener("click", () => void this.openRelation(source, handle, relation));
      pane.append(button);
    }
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
    if (this.latestRelationRequest !== request || this.navigation.state().focus?.view_id !== source.view_id) return;
    this.renderRelationGroup(source, relation, group);
    this.renderGraph(source, controller);
  }

  private renderRelationGroup(
    source: FocusedSource,
    relation: (typeof browserRelations)[number],
    group: RelationGroup,
  ): void {
    const pane = this.activeRelationsPane(source);
    if (!pane) return;
    pane.dataset.state = relationPaneState(group);
    pane.replaceChildren(textElement("h2", `Relations: ${relation}`));
    if (group.state !== "loaded") return void pane.append(textElement("p", group.state));
    if (group.candidates.length === 0) return void pane.append(textElement("p", "empty"));
    for (const candidate of group.candidates) pane.append(this.relationElement(candidate));
  }

  private activeRelationsPane(source: FocusedSource): HTMLElement | undefined {
    const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
    if (!pane) return;
    if (!this.activeRelationKey?.startsWith(`${source.view_id}:`)) return;
    return pane;
  }

  private relationElement(candidate: RelationCandidate): HTMLElement {
    const label = relationName(candidate);
    if (candidate.external) return textElement("p", label);
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: label });
    button.addEventListener("click", () => this.selectCandidate(candidate));
    return button;
  }

  private selectCandidate(candidate: RelationCandidate): void {
    void this.navigateCandidate(candidate).then((selected) => this.finishSelection(selected));
  }
}

function relationPaneState(group: RelationGroup): string {
  return group.state === "loaded" ? "ready" : group.state;
}
