import { createBrowserStore, renderBrowserBody } from "./app.js";
import { bindHistory, bindRefresh, showActionStatus } from "./application-events.js";
import { type BrowserReply, focusedSource, landmarkGroups } from "./browser-reply.js";
import { browserRequest } from "./browser-request.js";
import { BrowserDiscoveryController, type DiscoveryReply, renderDiscovery } from "./discovery.js";
import { type BrowserFocus, BrowserFocusNavigation, type FocusReply } from "./focus-navigation.js";
import { BrowserGraphController, renderGraphArea } from "./graph-navigation.js";
import { BrowserRelationsController, type RelationCandidate, type RelationGroup } from "./relations.js";
import type { BrowserStorage } from "./session.js";
import { type FocusedSource, renderFocusedSource } from "./source.js";

const relationNames = ["definition", "references", "callers", "callees", "type", "implementation"] as const;
type RelationName = (typeof relationNames)[number];

function isRelationName(value: string): value is RelationName {
  return relationNames.includes(value as RelationName);
}

function focusReply(reply: BrowserReply): FocusReply {
  const source = focusedSource(reply);
  if (!source) return { state: "invalid_browser_view" };
  return {
    state: "ok",
    data: { view_id: source.view_id, symbol_id: source.symbol.symbol_id, name: source.symbol.name, source },
  };
}

function relationFocus(candidate: RelationCandidate): BrowserFocus | undefined {
  if (!(candidate.view_id && candidate.symbol_id && candidate.path && candidate.kind && candidate.content))
    return undefined;
  const body = candidate.content.body ?? candidate.content.declaration;
  if (typeof body !== "string") return undefined;
  const returnedBytes = candidate.content.returned_bytes ?? new TextEncoder().encode(body).byteLength;
  const totalBytes = candidate.content.total_bytes ?? returnedBytes;
  const handles = (candidate.handles ?? []).map((handle) => ({
    handle: handle.handle,
    start: handle.start,
    end: handle.end,
    relations: [...handle.relations],
  }));
  const source: FocusedSource = {
    view_id: candidate.view_id,
    symbol: {
      name: candidate.display_name ?? candidate.name ?? candidate.symbol_id,
      kind: candidate.kind,
      path: candidate.path,
      symbol_id: candidate.symbol_id,
    },
    generation: candidate.project_generation ?? 0,
    body,
    handles,
    returned_bytes: returnedBytes,
    total_bytes: totalBytes,
    limit_bytes: candidate.content.limit_bytes ?? totalBytes,
    truncated: candidate.content.truncated === true,
  };
  return { view_id: source.view_id, symbol_id: source.symbol.symbol_id, name: source.symbol.name, source };
}

function bindSymbols(focus: (symbolId: string) => void): void {
  for (const button of document.querySelectorAll<HTMLElement>("[data-symbol-id]")) {
    button.addEventListener("click", () => {
      const symbolId = button.dataset.symbolId;
      if (symbolId) focus(symbolId);
    });
  }
}

function bindSearch(discovery: () => BrowserDiscoveryController, render: () => void): void {
  let pending: ReturnType<typeof setTimeout> | undefined;
  document.querySelector<HTMLInputElement>('[data-operation="search"]')?.addEventListener("input", (event) => {
    const query = (event.target as HTMLInputElement).value;
    clearTimeout(pending);
    pending = setTimeout(() => {
      if (discovery().state().query === query.trim()) return;
      void discovery().search(query).then(render);
    }, 150);
  });
}

function renderDiscoveryArea(discovery: BrowserDiscoveryController, focus: (symbolId: string) => void): void {
  const host = document.querySelector<HTMLElement>('[data-area="discovery"]');
  if (host) host.innerHTML = renderDiscovery(discovery.state());
  bindSymbols(focus);
}

function createDiscovery(storage: BrowserStorage, landmarks: ReturnType<typeof landmarkGroups>) {
  return new BrowserDiscoveryController(
    (request) =>
      browserRequest(storage, "api/search", {
        request_id: crypto.randomUUID(),
        ...request,
      }) as Promise<DiscoveryReply>,
    landmarks,
  );
}

function loadLandmarks(storage: BrowserStorage, apply: (groups: ReturnType<typeof landmarkGroups>) => void): void {
  void browserRequest(storage, "api/search", { request_id: crypto.randomUUID(), query: "" })
    .then((reply) => apply(landmarkGroups(reply)))
    .catch(() => undefined);
}

export function startApplication(storage: BrowserStorage, startedState: string, root: HTMLDivElement): void {
  const store = createBrowserStore({ status: startedState, landmarks: [] });
  root.innerHTML = renderBrowserBody(store.state(), window.innerWidth);
  const navigation = new BrowserFocusNavigation(undefined, async ({ symbol_id }) =>
    focusReply(
      await browserRequest(storage, "api/focus", {
        request_id: crypto.randomUUID(),
        symbol_id,
      }),
    ),
  );
  const relationControllers = new Map<string, BrowserRelationsController>();
  let activeRelationKey: string | undefined;
  let latestRelationRequest: object | undefined;
  let graphCandidates = new Map<string, RelationCandidate>();

  function relationController(
    source: FocusedSource,
    handle: FocusedSource["handles"][number],
  ): BrowserRelationsController {
    const key = `${source.view_id}:${handle.handle}`;
    const existing = relationControllers.get(key);
    if (existing) return existing;
    const supported = handle.relations.filter(isRelationName);
    const controller = new BrowserRelationsController(
      {
        view_id: source.view_id,
        handle: handle.handle,
        supported,
        unavailable: relationNames.filter((relation) => !supported.includes(relation)),
      },
      async (request) => {
        const reply = await browserRequest(storage, "api/follow", {
          request_id: crypto.randomUUID(),
          view_id: request.view_id,
          handle: request.handle,
          relation: request.relation,
          limit: request.limit,
        });
        const data = Object(reply.data) as Record<string, unknown>;
        const candidates = Array.isArray(data.candidates)
          ? data.candidates
          : data.focus && typeof data.focus === "object"
            ? [data.focus]
            : [];
        return {
          state: reply.state === "unavailable_relation" ? reply.state : "ok",
          project_generation: reply.project_generation,
          data: {
            candidates: candidates as RelationCandidate[],
            omitted_count: typeof data.omitted_count === "number" ? data.omitted_count : 0,
          },
        };
      },
    );
    relationControllers.set(key, controller);
    return controller;
  }

  function resetRelations(): void {
    activeRelationKey = undefined;
    latestRelationRequest = {};
    const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
    if (!pane) return;
    pane.dataset.state = "empty";
    pane.replaceChildren(
      Object.assign(document.createElement("h2"), { textContent: "Relations" }),
      Object.assign(document.createElement("p"), { textContent: "No relations loaded" }),
    );
  }

  function renderGraph(source: FocusedSource, controller: BrowserRelationsController | undefined): void {
    const host = document.querySelector<HTMLElement>('[data-area="graph"]');
    if (!host) return;
    const groups = controller ? relationNames.map((relation) => controller.state(relation)) : [];
    graphCandidates = new Map(
      groups.flatMap((group) =>
        group.candidates.flatMap((candidate) =>
          candidate.symbol_id ? [[candidate.symbol_id, candidate] as const] : [],
        ),
      ),
    );
    const graph = graphController.graphFor({ symbol_id: source.symbol.symbol_id, name: source.symbol.name }, groups);
    host.outerHTML = renderGraphArea(graph);
    const rendered = document.querySelector<HTMLElement>('[data-area="graph"]');
    for (const node of rendered?.querySelectorAll<HTMLElement>("[data-focus]") ?? []) {
      const symbolId = node.dataset.focus;
      const graphNode = graph.nodes.find((candidate) => candidate.symbol_id === symbolId);
      node.addEventListener("click", () => {
        void graphController.select(graphNode).then((selected) => {
          if (selected) {
            renderFocusedView();
            showActionStatus("ready");
          } else showActionStatus(navigation.state().error ?? "backend_unavailable");
        });
      });
    }
  }

  async function navigateCandidate(candidate: RelationCandidate): Promise<boolean> {
    const focus = relationFocus(candidate);
    if (focus) return navigation.selectView(focus);
    if (candidate.symbol_id) return navigation.selectRelation({ symbol_id: candidate.symbol_id });
    return false;
  }

  function renderRelationGroup(
    source: FocusedSource,
    controller: BrowserRelationsController,
    relation: RelationName,
    group: RelationGroup,
  ): void {
    const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
    if (!(pane && activeRelationKey?.startsWith(`${source.view_id}:`))) return;
    pane.dataset.state = group.state === "loaded" ? "ready" : group.state;
    pane.replaceChildren(Object.assign(document.createElement("h2"), { textContent: `Relations: ${relation}` }));
    if (group.state !== "loaded") {
      pane.append(Object.assign(document.createElement("p"), { textContent: group.state }));
      return;
    }
    if (group.candidates.length === 0) {
      pane.append(Object.assign(document.createElement("p"), { textContent: "empty" }));
      return;
    }
    for (const candidate of group.candidates) {
      const label = candidate.display_name ?? candidate.name ?? candidate.symbol_id ?? "relation";
      if (candidate.external) {
        pane.append(Object.assign(document.createElement("p"), { textContent: label }));
        continue;
      }
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: label });
      button.addEventListener("click", () => {
        void navigateCandidate(candidate).then((selected) => {
          if (selected) {
            renderFocusedView();
            showActionStatus("ready");
          } else showActionStatus(navigation.state().error ?? "backend_unavailable");
        });
      });
      pane.append(button);
    }
  }

  async function openRelation(
    source: FocusedSource,
    handle: FocusedSource["handles"][number],
    relation: RelationName,
  ): Promise<void> {
    const controller = relationController(source, handle);
    const request = {};
    latestRelationRequest = request;
    const group = await controller.open(relation);
    if (latestRelationRequest !== request || navigation.state().focus?.view_id !== source.view_id) return;
    renderRelationGroup(source, controller, relation, group);
    renderGraph(source, controller);
  }

  function showRelationChoices(source: FocusedSource, handle: FocusedSource["handles"][number]): void {
    const controller = relationController(source, handle);
    activeRelationKey = `${source.view_id}:${handle.handle}`;
    latestRelationRequest = {};
    const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
    if (!pane) return;
    pane.dataset.state = "empty";
    pane.replaceChildren(Object.assign(document.createElement("h2"), { textContent: "Relations" }));
    for (const relation of handle.relations.filter(isRelationName)) {
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: relation });
      button.dataset.relation = relation;
      button.addEventListener("click", () => void openRelation(source, handle, relation));
      pane.append(button);
    }
    renderGraph(source, controller);
  }

  function bindSourceRelations(source: FocusedSource): void {
    for (const mark of document.querySelectorAll<HTMLElement>("mark[data-handle]")) {
      mark.addEventListener("click", () => {
        const handle = source.handles.find((candidate) => candidate.handle === mark.dataset.handle);
        if (handle) showRelationChoices(source, handle);
      });
    }
  }

  function renderFocusedView(): void {
    const source = navigation.state().focus?.source;
    if (!source) return;
    const sourceHost = document.querySelector<HTMLElement>('[data-area="source"]');
    if (sourceHost) sourceHost.innerHTML = renderFocusedSource(source);
    bindSourceRelations(source);
    resetRelations();
    renderGraph(source, undefined);
  }

  const graphController = new BrowserGraphController(
    navigation,
    () => false,
    (target) => {
      const candidate = graphCandidates.get(target.symbol_id);
      return candidate ? navigateCandidate(candidate) : navigation.selectRelation(target);
    },
  );

  let latestFocusRequest = 0;
  async function focusSymbol(symbolId: string): Promise<void> {
    const request = ++latestFocusRequest;
    const selected = await navigation.selectSearch({ symbol_id: symbolId });
    if (request !== latestFocusRequest) return;
    if (selected) {
      renderFocusedView();
      showActionStatus("ready");
    } else showActionStatus(navigation.state().error ?? "backend_unavailable");
  }

  document.querySelector<HTMLElement>('[data-operation="refocus"]')?.addEventListener("click", () => {
    const symbolId = navigation.state().focus?.symbol_id;
    if (symbolId) void focusSymbol(symbolId);
  });

  let discovery = createDiscovery(storage, []);
  bindSymbols(focusSymbol);
  bindSearch(
    () => discovery,
    () => renderDiscoveryArea(discovery, focusSymbol),
  );
  loadLandmarks(storage, (landmarks) => {
    if (discovery.state().query) return;
    discovery = createDiscovery(storage, landmarks);
    renderDiscoveryArea(discovery, focusSymbol);
  });
  bindHistory(async (action) => {
    const moved = action === "back" ? navigation.back() : navigation.forward();
    if (moved) {
      renderFocusedView();
      showActionStatus("ready");
    } else showActionStatus("history_empty");
  });
  bindRefresh(storage);
}
