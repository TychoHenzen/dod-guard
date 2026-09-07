// src/browser/escape-text.ts
function escapeText(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// src/browser/browser-shell-render.ts
function renderLandmark(item) {
  if (typeof item === "string") return `<li>${escapeText(item)}</li>`;
  return `<li><button type="button" data-symbol-id="${escapeText(item.symbol_id)}">${escapeText(item.name)}</button> <span>${escapeText(item.kind)} \xC3\u201A\xC2\xB7 ${escapeText(item.path)}</span></li>`;
}
function renderLandmarks(landmarks) {
  if (landmarks.length === 0)
    return '<p data-state="empty">No landmarks available</p>';
  return landmarks.map(
    ({ group, items }) => `<section class="landmark-group"><h3>${escapeText(group)}</h3><ul>${items.map(renderLandmark).join("")}</ul></section>`
  ).join("");
}
function drawerButton(name, open) {
  const label = name === "discovery" ? "Discovery" : "Relations";
  return `<button type="button" data-drawer="${name}" aria-controls="${name}-pane" aria-expanded="${open}">${label}</button>`;
}
function renderFocus(focus) {
  if (!focus) return '<p data-state="empty-focus">Select a symbol</p>';
  return `<article class="focused-symbol"><h2>${escapeText(focus.name)}</h2><p>${escapeText(focus.kind)} \xC3\u201A\xC2\xB7 ${escapeText(focus.path)}</p></article>`;
}
function renderDiscoveryButton(state, narrow) {
  return narrow ? drawerButton("discovery", state.activeDrawer === "discovery") : "";
}
function renderRelationButton(state, narrow) {
  return narrow ? drawerButton("relations", state.activeDrawer === "relations") : "";
}
function renderBrowserBody(state, viewportWidth) {
  const narrow = viewportWidth < 900;
  const disabled = state.navigationEnabled ? "" : " disabled";
  const header = `<header class="status-strip"><span data-area="status">${escapeText(state.status)}</span><nav aria-label="Navigation"><button type="button" data-operation="back"${disabled}>Back</button><button type="button" data-operation="forward"${disabled}>Forward</button><button type="button" data-operation="refocus"${disabled}>Refocus</button><button type="button" data-operation="refresh">Refresh</button></nav></header>`;
  const main = `<main class="explorer-shell ${narrow ? "narrow" : "desktop"}">` + renderDiscoveryButton(state, narrow) + `<aside id="discovery-pane" data-pane="discovery"><h2>Landmarks</h2><label>Search <input type="search" data-operation="search"${disabled}></label><div data-area="discovery">${renderLandmarks(state.landmarks)}</div></aside><section data-pane="focus"><h1>Focused source</h1><div data-area="source">${renderFocus(state.focus)}</div><div data-area="graph" data-state="empty">No graph loaded</div></section><aside id="relations-pane" data-pane="relations"><h2>Relations</h2><p data-state="empty-relations">No relations loaded</p></aside>${renderRelationButton(state, narrow)}</main>`;
  return header + main;
}

// src/browser/app.ts
var visibleOperations = [
  "search",
  "focus",
  "back",
  "forward",
  "refocus",
  "refresh",
  "status",
  "set_filters",
  "set_drawer"
];
function defaultValue(value, fallback) {
  if (value !== void 0) return value;
  return fallback;
}
function initialState(initial) {
  return {
    landmarks: defaultValue(initial.landmarks, []),
    focus: initial.focus,
    activeDrawer: initial.activeDrawer,
    status: defaultValue(initial.status, "Project ready"),
    navigationEnabled: defaultValue(initial.navigationEnabled, true)
  };
}
function applyAction(state, action) {
  if (!visibleOperations.includes(action.operation))
    throw new Error("unsupported_browser_operation");
  if (action.operation === "focus" && action.symbol)
    return { ...state, focus: action.symbol };
  if (action.operation === "set_drawer")
    return { ...state, activeDrawer: action.drawer };
  return state;
}
function createBrowserStore(initial = {}) {
  let state = initialState(initial);
  return {
    state: () => state,
    visibleOperations: () => visibleOperations,
    dispatch: (action) => {
      state = applyAction(state, action);
    }
  };
}

// src/browser/browser-landmarks-reply.ts
function hasStrings(value, keys) {
  return keys.every((key) => typeof value[key] === "string");
}
function landmarkItem(value) {
  if (!value || typeof value !== "object") return void 0;
  const item = value;
  if (!hasStrings(item, ["symbol_id", "name", "path", "kind"]))
    return void 0;
  return {
    symbol_id: item.symbol_id,
    name: item.name,
    path: item.path,
    kind: item.kind
  };
}
function landmarkGroup(value) {
  if (!value || typeof value !== "object") return void 0;
  const candidate = value;
  if (!hasStrings(candidate, ["group"])) return void 0;
  if (!Array.isArray(candidate.symbols)) return void 0;
  return {
    group: candidate.group,
    items: landmarkItems(candidate.symbols)
  };
}
function landmarkItems(values) {
  return values.flatMap((item) => {
    const landmark = landmarkItem(item);
    return landmark ? [landmark] : [];
  });
}
function landmarkGroups(reply) {
  const groups = Array.isArray(reply.data?.landmarks) ? reply.data.landmarks : [];
  return groups.flatMap((value) => {
    const group = landmarkGroup(value);
    return group ? [group] : [];
  });
}

// src/browser/source-handles.ts
function isRecord(value) {
  return Boolean(value) && typeof value === "object";
}
function hasHandleShape(candidate) {
  return typeof candidate.handle === "string" && typeof candidate.start === "number" && typeof candidate.end === "number" && Array.isArray(candidate.relations) && candidate.out_of_range !== true;
}
function hasValidRange(candidate, body) {
  return Number.isInteger(candidate.start) && Number.isInteger(candidate.end) && candidate.start >= 0 && candidate.end <= body.length;
}
function stringRelations(candidate) {
  return candidate.relations.filter(
    (relation) => typeof relation === "string"
  );
}
function sourceHandles(data, body) {
  const candidates = Array.isArray(data.handles) ? data.handles : [];
  const handles = [];
  for (const value of candidates) {
    const handle = sourceHandle(value, body);
    if (handle) handles.push(handle);
  }
  return handles;
}
function sourceHandle(value, body) {
  if (!isRecord(value) || !hasHandleShape(value) || !hasValidRange(value, body))
    return void 0;
  return {
    handle: value.handle,
    start: value.start,
    end: value.end,
    relations: stringRelations(value)
  };
}

// src/browser/browser-reply.ts
function sourceGeneration(reply) {
  if (typeof reply.data?.project_generation === "number")
    return reply.data.project_generation;
  return typeof reply.project_generation === "number" ? reply.project_generation : 0;
}
function numberField(value, key) {
  return typeof value?.[key] === "number" ? value[key] : 0;
}
function firstStringField(value, keys) {
  for (const key of keys) {
    if (typeof value[key] === "string") return value[key];
  }
  return void 0;
}
function focusedSource(reply) {
  const data = Object(reply.data);
  const content = Object(data.content);
  const body = firstStringField(content, ["body", "declaration"]);
  if (!hasStrings(data, ["view_id", "symbol_id", "name", "kind", "path"]))
    return void 0;
  if (typeof body !== "string") return void 0;
  return {
    view_id: data.view_id,
    symbol: {
      name: data.name,
      kind: data.kind,
      path: data.path,
      symbol_id: data.symbol_id
    },
    generation: sourceGeneration(reply),
    body,
    handles: sourceHandles(data, body),
    returned_bytes: numberField(content, "returned_bytes"),
    total_bytes: numberField(content, "total_bytes"),
    limit_bytes: numberField(content, "limit_bytes"),
    truncated: content.truncated === true
  };
}

// src/browser/browser-request.ts
function ownership(storage) {
  const session = storage.get("browser_session_id");
  const tab = storage.get("tab_instance_id");
  return session && tab ? { "x-code-explorer-session": session, "x-code-explorer-tab": tab } : void 0;
}
async function browserRequest(storage, path, body) {
  const headers = ownership(storage);
  if (!headers) throw new Error("invalid_browser_session");
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.code ?? "workspace_unavailable");
  return payload;
}

// src/browser/discovery-search.ts
function searchRequest(query, filters) {
  const values = {
    path_globs: copyList(filters.path_globs),
    languages: copyList(filters.languages),
    kinds: copyList(filters.kinds),
    content: filters.content,
    include_generated: filters.include_generated
  };
  return {
    query,
    ...Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== void 0)
    )
  };
}
function copyList(values) {
  if (values === void 0) return void 0;
  return [...values];
}
function emptySearchState(current, filters, landmarks) {
  return {
    ...current,
    query: "",
    filters,
    candidates: [],
    landmarks,
    omittedCount: 0,
    refinementGuidance: void 0,
    mode: "landmarks",
    areaState: "not_loaded",
    error: void 0
  };
}
function loadedSearchState(current, reply, filters) {
  const candidates = replyCandidates(reply);
  const omittedCount2 = replyOmittedCount(reply);
  return {
    ...current,
    filters,
    candidates,
    omittedCount: omittedCount2,
    refinementGuidance: reply.data.refinement_guidance,
    mode: "results",
    areaState: candidateAreaState(candidates)
  };
}
function replyCandidates(reply) {
  if (reply.data.candidates) return reply.data.candidates;
  return [];
}
function replyOmittedCount(reply) {
  if (reply.data.omitted_candidate_count !== void 0)
    return reply.data.omitted_candidate_count;
  return reply.data.omitted_count ?? 0;
}
function candidateAreaState(candidates) {
  if (candidates.length === 0) return "empty";
  return "ready";
}

// src/browser/discovery-search-load.ts
async function loadDiscoverySearch(options) {
  try {
    const reply = await options.searchCore(options.request);
    if (options.latestSearches.get(options.owner) !== options.request)
      return options.current;
    return loadedSearchState(options.current, reply, options.filters);
  } catch {
    if (options.latestSearches.get(options.owner) !== options.request)
      return options.current;
    return {
      ...options.current,
      mode: "results",
      areaState: "failed",
      error: "backend_unavailable"
    };
  }
}

// src/browser/discovery-render.ts
function renderLandmarks2(landmarks) {
  return landmarks.map(
    (group) => `<section class="landmark-group"><h3>${escapeText(group.group)}</h3><ul>${group.items.map((item) => renderLandmark2(item)).join("")}</ul></section>`
  ).join("");
}
function renderLandmark2(item) {
  const label = item.symbol_id ? `<button type="button" data-symbol-id="${escapeText(item.symbol_id)}">${escapeText(item.name)}</button>` : escapeText(item.name);
  return `<li>${label} <span>${escapeText(item.kind)} \xC3\u201A\xC2\xB7 ${escapeText(item.path)}</span></li>`;
}
function candidateName(candidate) {
  if (candidate.type === "file")
    return candidate.path.split("/").at(-1) ?? candidate.path;
  return candidate.name;
}
function candidateKind(candidate) {
  if (candidate.type === "file") return "file";
  return candidate.kind;
}
function candidateLabel(candidate, name) {
  if (candidate.identity)
    return `<button type="button" data-symbol-id="${escapeText(candidate.identity)}">${escapeText(name)}</button>`;
  return `<strong>${escapeText(name)}</strong>`;
}
function renderCandidate(candidate) {
  const name = candidateName(candidate);
  const kind = candidateKind(candidate);
  const label = candidateLabel(candidate, name);
  return `<li data-match-class="${escapeText(candidate.match_class)}">${label} <span>${escapeText(candidate.match_class)} ${candidate.match_score}</span> <span>${escapeText(candidate.path)} \xC3\u201A\xC2\xB7 ${escapeText(kind)}</span></li>`;
}
function renderDiscovery(state) {
  if (!isRenderableAreaState(state.areaState)) return renderErrorState(state);
  if (state.mode === "landmarks") return renderLandmarkState(state);
  return renderCandidateState(state);
}
function isRenderableAreaState(state) {
  return ["ready", "empty", "not_loaded"].includes(state);
}
function renderErrorState(state) {
  return `<section data-discovery="results" data-state="${state.areaState}">${state.error ?? state.areaState}</section>`;
}
function renderLandmarkState(state) {
  return `<section data-discovery="landmarks">${renderLandmarks2(state.landmarks)}</section>`;
}
function renderCandidateState(state) {
  const candidates = state.candidates.map(renderCandidate).join("");
  const omitted = state.omittedCount > 0 ? `<p>${state.omittedCount} omitted</p>` : "";
  const guidance = state.refinementGuidance ? `<p>${escapeText(state.refinementGuidance)}</p>` : "";
  return `<section data-discovery="results" data-state="${state.areaState}"><ul>${candidates}</ul>${omitted}${guidance}</section>`;
}

// src/browser/discovery.ts
var latestSearches = /* @__PURE__ */ new WeakMap();
var BrowserDiscoveryController = class {
  constructor(searchCore, landmarks = []) {
    this.searchCore = searchCore;
    this.current = {
      query: "",
      filters: {},
      candidates: [],
      landmarks,
      omittedCount: 0,
      mode: "landmarks",
      areaState: "not_loaded"
    };
  }
  searchCore;
  current;
  state() {
    return this.current;
  }
  beginSearch(query, filters) {
    const request = searchRequest(query, filters);
    latestSearches.set(this, request);
    this.current = {
      ...this.current,
      query,
      filters,
      areaState: "loading",
      error: void 0
    };
    return request;
  }
  async search(query, filters = {}) {
    latestSearches.delete(this);
    const normalized = query.trim();
    if (normalized.length === 0) {
      const current = this.current;
      const landmarks = current.landmarks;
      return this.current = emptySearchState(current, filters, landmarks);
    }
    const request = this.beginSearch(normalized, filters);
    const next = await loadDiscoverySearch({
      owner: this,
      latestSearches,
      request,
      current: this.current,
      filters,
      searchCore: this.searchCore
    });
    if (latestSearches.get(this) !== request) return this.current;
    this.current = next;
    return this.current;
  }
};

// src/browser/application-discovery.ts
function bindSymbols(focus) {
  for (const button of document.querySelectorAll(
    "[data-symbol-id]"
  )) {
    button.addEventListener("click", () => {
      const symbolId = button.dataset.symbolId;
      if (symbolId) focus(symbolId);
    });
  }
}
function bindSearch(discovery, render) {
  let pending;
  document.querySelector('[data-operation="search"]')?.addEventListener("input", (event) => {
    const query = event.target.value;
    clearTimeout(pending);
    pending = setTimeout(() => {
      if (discovery().state().query === query.trim()) return;
      void discovery().search(query).then(render);
    }, 150);
  });
}
function renderDiscoveryArea(discovery, focus) {
  const host = document.querySelector('[data-area="discovery"]');
  if (host) host.innerHTML = renderDiscovery(discovery.state());
  bindSymbols(focus);
}
function createDiscovery(storage, landmarks) {
  return new BrowserDiscoveryController(
    (request) => browserRequest(storage, "api/search", {
      request_id: crypto.randomUUID(),
      ...request
    }),
    landmarks
  );
}
function loadLandmarks(storage, apply) {
  void browserRequest(storage, "api/search", {
    request_id: crypto.randomUUID(),
    query: ""
  }).then((reply) => apply(landmarkGroups(reply))).catch(() => void 0);
}

// src/browser/application-events.ts
function showActionError(error) {
  showActionStatus(
    error instanceof Error ? error.message : "backend_unavailable"
  );
}
function showActionStatus(value) {
  const status = document.querySelector('[data-area="status"]');
  if (status) status.textContent = value;
}
function bindHistory(navigate) {
  for (const operation of ["back", "forward"]) {
    document.querySelector(`[data-operation="${operation}"]`)?.addEventListener("click", () => {
      void navigate(operation);
    });
  }
}
function bindRefresh(storage, onSuccess, request = browserRequest) {
  document.querySelector('[data-operation="refresh"]')?.addEventListener("click", () => {
    void refreshAction(storage, onSuccess, request);
  });
}
async function refreshAction(storage, onSuccess, request) {
  try {
    const reply = await request(storage, "api/status", {
      action: "refresh",
      request_id: crypto.randomUUID()
    });
    showActionStatus(reply.state ?? "ready");
    onSuccess?.();
  } catch (error) {
    showActionError(error);
  }
}

// src/browser/application-focus.ts
var ApplicationFocusController = class {
  constructor(navigation, relationView) {
    this.navigation = navigation;
    this.relationView = relationView;
  }
  navigation;
  relationView;
  latestFocusRequest = 0;
  async focusSymbol(symbolId) {
    const request = ++this.latestFocusRequest;
    const selected = await this.navigation.selectSearch({
      symbol_id: symbolId
    });
    if (request !== this.latestFocusRequest) return;
    if (selected) {
      this.relationView.renderFocusedView();
      showActionStatus("ready");
      return;
    }
    showActionStatus(this.navigation.state().error ?? "backend_unavailable");
  }
};

// src/browser/focus-navigation-state.ts
function createFocusNavigationState(initial) {
  if (initial)
    return { focus: initial, history: [initial], historyPosition: 0 };
  return { history: [], historyPosition: -1 };
}

// src/browser/focus-history.ts
function moveHistory(current, direction, onStart) {
  if (!historyAvailable(current, direction)) return void 0;
  onStart();
  const historyPosition = current.historyPosition + (direction === "back" ? -1 : 1);
  const focus = current.history[historyPosition];
  if (!focus) return void 0;
  return { ...current, focus, historyPosition, error: void 0 };
}
function historyAvailable(current, direction) {
  if (direction === "back") return current.historyPosition > 0;
  return current.historyPosition < current.history.length - 1;
}

// src/browser/focus-state-transitions.ts
function commitFocus(current, focus) {
  const history = [
    ...current.history.slice(0, current.historyPosition + 1),
    focus
  ];
  return {
    focus,
    history,
    historyPosition: history.length - 1,
    error: void 0
  };
}
function commitFocusReply(current, reply) {
  if (reply.state !== "ok" || !reply.data)
    return { state: { ...current, error: reply.state }, accepted: false };
  return { state: commitFocus(current, reply.data), accepted: true };
}

// src/browser/focus-navigation.ts
var BrowserFocusNavigation = class {
  constructor(initial, focusCore) {
    this.focusCore = focusCore;
    this.current = createFocusNavigationState(initial);
  }
  focusCore;
  current;
  requestSequence = 0;
  state() {
    return this.current;
  }
  selectSearch(target) {
    return this.focus(target);
  }
  selectLandmark(target) {
    return this.focus(target);
  }
  selectHandle(target) {
    return this.focus(target);
  }
  selectRelation(target) {
    return this.focus(target);
  }
  selectView(focus) {
    this.requestSequence += 1;
    this.commit(focus);
    return true;
  }
  back() {
    const next = moveHistory(this.current, "back", () => {
      this.requestSequence += 1;
    });
    if (!next) return false;
    this.current = next;
    return true;
  }
  forward() {
    const next = moveHistory(this.current, "forward", () => {
      this.requestSequence += 1;
    });
    if (!next) return false;
    this.current = next;
    return true;
  }
  async focus(target) {
    const requestSequence = ++this.requestSequence;
    try {
      const reply = await this.focusCore(target);
      if (requestSequence !== this.requestSequence) return false;
      return this.commitReply(reply);
    } catch (error) {
      if (requestSequence !== this.requestSequence) return false;
      this.current = {
        ...this.current,
        error: error instanceof Error ? error.message : "backend_unavailable"
      };
      return false;
    }
  }
  commitReply(reply) {
    const committed = commitFocusReply(this.current, reply);
    this.current = committed.state;
    return committed.accepted;
  }
  commit(focus) {
    this.current = commitFocus(this.current, focus);
  }
};

// src/browser/application-navigation.ts
function focusReply(reply) {
  const source = focusedSource(reply);
  const data = source && {
    view_id: source.view_id,
    symbol_id: source.symbol.symbol_id,
    name: source.symbol.name,
    source
  };
  return data ? { state: "ok", data } : { state: "invalid_browser_view" };
}
function createNavigation(storage) {
  return new BrowserFocusNavigation(
    void 0,
    (target) => focusNavigation(storage, target.symbol_id)
  );
}
async function focusNavigation(storage, symbol_id) {
  const reply = await browserRequest(storage, "api/focus", {
    request_id: crypto.randomUUID(),
    symbol_id
  });
  return focusReply(reply);
}

// src/browser/graph-projection-edges.ts
var relationLabel = {
  definition: "definition",
  references: "reference",
  callers: "caller",
  callees: "callee",
  type: "type",
  implementations: "implementation"
};
function normalizedIdentity(symbolId) {
  return symbolId.trim().normalize("NFC");
}
function isLocalCandidate(candidate) {
  return candidate.external !== true && candidate.discovery_only !== true;
}
function edgeFor(relation, candidateId, focusId) {
  const incoming = relation === "references" || relation === "callers";
  return {
    from: incoming ? candidateId : focusId,
    to: incoming ? focusId : candidateId,
    label: relationLabel[relation]
  };
}
function addGroup(options) {
  const { group, focusId, nodes, edges, omitted } = options;
  if (group.omitted_count > 0) omitted.set(group.relation, group.omitted_count);
  for (const candidate of group.candidates) {
    addCandidate({
      candidate,
      relation: group.relation,
      focusId,
      nodes,
      edges
    });
  }
}
function addCandidate(options) {
  const { candidate, relation, focusId, nodes, edges } = options;
  const symbolId = normalizedIdentity(candidate.symbol_id);
  if (!isLocalCandidate(candidate) || symbolId.length === 0) return;
  if (!nodes.has(symbolId))
    nodes.set(symbolId, {
      symbol_id: symbolId,
      name: candidate.name,
      center: false,
      selectable: true
    });
  edges.push(edgeFor(relation, symbolId, focusId));
}

// src/browser/graph-projection.ts
var relationOrder = [
  "definition",
  "references",
  "callers",
  "callees",
  "type",
  "implementations"
];
function projectOneHopGraph(focus, groups) {
  const focusId = normalizedIdentity(focus.symbol_id);
  if (focusId.length === 0) throw new Error("invalid_graph_focus");
  const nodes = /* @__PURE__ */ new Map([
    [
      focusId,
      { symbol_id: focusId, name: focus.name, center: true, selectable: false }
    ]
  ]);
  const edges = [];
  const omitted = /* @__PURE__ */ new Map();
  const byRelation = new Map(groups.map((group) => [group.relation, group]));
  for (const relation of relationOrder) {
    const group = byRelation.get(relation);
    if (group?.state === "loaded")
      addGroup({ group, focusId, nodes, edges, omitted });
  }
  return { nodes: [...nodes.values()], edges, omitted };
}

// src/browser/graph-render.ts
function edgeLane(edge) {
  return edge.label === "caller" || edge.label === "reference" ? "incoming" : "outgoing";
}
function laneFor(node, graph) {
  if (node.center) return "center";
  const edge = graph.edges.find(
    (candidate) => candidate.from === node.symbol_id || candidate.to === node.symbol_id
  );
  return edge ? edgeLane(edge) : "outgoing";
}
function nodePositions(graph) {
  const positions = /* @__PURE__ */ new Map();
  const rows = {
    incoming: 0,
    center: 0,
    outgoing: 0
  };
  for (const node of graph.nodes) {
    const lane = laneFor(node, graph);
    rows[lane] += 1;
    const x = lane === "incoming" ? "16%" : lane === "center" ? "50%" : "84%";
    positions.set(node.symbol_id, { lane, x, y: rows[lane] * 48 });
  }
  return positions;
}
function renderEdges(graph, positions) {
  return graph.edges.map((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!(from && to)) throw new Error("invalid_graph_projection");
    const direction = edgeLane(edge);
    return `<path data-edge-label="${edge.label}" data-direction="${direction}" d="M ${from.x} ${from.y} L ${to.x} ${to.y}" marker-end="url(#graph-arrow)"/>`;
  }).join("");
}
function renderNodes(graph, positions) {
  return graph.nodes.map((node) => {
    const position = positions.get(node.symbol_id);
    if (!position) throw new Error("invalid_graph_projection");
    const selection = node.selectable ? ` data-focus="${escapeText(node.symbol_id)}"` : "";
    return `<text data-node-id="${escapeText(node.symbol_id)}" data-lane="${position.lane}" x="${position.x}" y="${position.y}"${selection}>${escapeText(node.name)}</text>`;
  }).join("");
}
function renderOmitted(graph) {
  return [...graph.omitted.entries()].map(
    ([relation, count]) => `<text data-omitted-relation="${relation}">${count} omitted</text>`
  ).join("");
}
function renderOneHopGraph(graph) {
  const positions = nodePositions(graph);
  const edgeMarkup = renderEdges(graph, positions);
  const nodeMarkup = renderNodes(graph, positions);
  const omittedMarkup = renderOmitted(graph);
  return `<svg data-graph="one-hop" viewBox="0 0 100 100" role="img"><defs><marker id="graph-arrow" markerWidth="4" markerHeight="4" refX="4" refY="2" orient="auto"><path d="M 0 0 L 4 2 L 0 4 z"/></marker></defs>${edgeMarkup}${nodeMarkup}${omittedMarkup}</svg>`;
}

// src/browser/graph-render-area.ts
function renderGraphArea(graph, options = {}) {
  if (options.collapsed)
    return '<section data-area="graph" data-state="collapsed">collapsed</section>';
  try {
    const svg = renderOneHopGraph(graph);
    if (options.stale)
      return `<section data-area="graph" data-state="stale">stale${svg}</section>`;
    return `<section data-area="graph" data-state="ready">${svg}</section>`;
  } catch {
    return '<section data-area="graph" data-state="failed">graph_render_failed</section>';
  }
}

// src/browser/graph-navigation.ts
function graphName(candidate) {
  if (candidate.name) return candidate.name;
  if (candidate.display_name) return candidate.display_name;
  return candidate.symbol_id ?? "";
}
function toGraphRelationGroups(groups) {
  return groups.map((group) => ({
    relation: group.relation === "implementation" ? "implementations" : group.relation,
    state: group.state,
    omitted_count: group.omitted_count,
    candidates: group.candidates.flatMap(
      (candidate) => candidate.symbol_id ? [
        {
          symbol_id: candidate.symbol_id,
          name: graphName(candidate),
          external: candidate.external,
          discovery_only: candidate.discovery_only
        }
      ] : []
    )
  }));
}
function graphFor(focus, groups) {
  return projectOneHopGraph(focus, toGraphRelationGroups(groups));
}
var BrowserGraphController = class {
  constructor(navigation, isStale, selectTarget = (target) => navigation.selectRelation(target)) {
    this.navigation = navigation;
    this.isStale = isStale;
    this.selectTarget = selectTarget;
  }
  navigation;
  isStale;
  selectTarget;
  async select(node) {
    if (!node?.selectable || this.isStale()) return false;
    const target = { symbol_id: node.symbol_id };
    return this.selectTarget(target);
  }
};

// src/navigation/focus-relation-names.ts
var browserRelationNames = [
  "definition",
  "references",
  "callers",
  "callees",
  "type",
  "implementation"
];

// src/browser/relation-data.ts
var browserRelations = browserRelationNames;
function isBrowserRelation(value) {
  return browserRelations.includes(value);
}
function relationCandidates(data) {
  if (Array.isArray(data.candidates))
    return data.candidates;
  if (data.focus && typeof data.focus === "object")
    return [data.focus];
  return [];
}
function relationName(candidate) {
  if (candidate.display_name) return candidate.display_name;
  if (candidate.name) return candidate.name;
  if (candidate.symbol_id) return candidate.symbol_id;
  return "relation";
}
function relationHandles(candidate) {
  return (candidate.handles ?? []).map(({ handle, start, end, relations }) => ({
    handle,
    start,
    end,
    relations: [...relations]
  }));
}
function graphCandidateMap(groups) {
  const candidates = /* @__PURE__ */ new Map();
  for (const group of groups) {
    for (const candidate of group.candidates) {
      if (candidate.symbol_id) candidates.set(candidate.symbol_id, candidate);
    }
  }
  return candidates;
}

// src/browser/relation-focus-support.ts
function relationBody(content) {
  if (typeof content.body === "string") return content.body;
  return typeof content.declaration === "string" ? content.declaration : void 0;
}
function relationReturnedBytes(content, body) {
  if (typeof content.returned_bytes === "number") return content.returned_bytes;
  return new TextEncoder().encode(body).byteLength;
}
function relationTotalBytes(content, returnedBytes) {
  return typeof content.total_bytes === "number" ? content.total_bytes : returnedBytes;
}
function relationLimit(content, totalBytes) {
  return typeof content.limit_bytes === "number" ? content.limit_bytes : totalBytes;
}
function relationGeneration(candidate) {
  return typeof candidate.project_generation === "number" ? candidate.project_generation : 0;
}
function hasFocusPayload(candidate) {
  return Boolean(
    candidate.view_id && candidate.symbol_id && candidate.path && candidate.kind && candidate.content
  );
}

// src/browser/relation-focus.ts
function relationFocus(candidate) {
  if (!hasFocusPayload(candidate)) return;
  const body = relationBody(candidate.content);
  if (typeof body !== "string") return;
  const source = focusedSource2(candidate, body);
  return {
    view_id: source.view_id,
    symbol_id: source.symbol.symbol_id,
    name: source.symbol.name,
    source
  };
}
function focusedSource2(candidate, body) {
  const returnedBytes = relationReturnedBytes(candidate.content, body);
  const totalBytes = relationTotalBytes(candidate.content, returnedBytes);
  return {
    view_id: candidate.view_id,
    symbol: {
      name: relationName(candidate),
      kind: candidate.kind,
      path: candidate.path,
      symbol_id: candidate.symbol_id
    },
    generation: relationGeneration(candidate),
    body,
    handles: relationHandles(candidate),
    returned_bytes: returnedBytes,
    total_bytes: totalBytes,
    limit_bytes: relationLimit(candidate.content, totalBytes),
    truncated: candidate.content.truncated === true
  };
}

// src/browser/relation-target-navigation.ts
function navigateRelationCandidate(navigation, candidate) {
  const focus = relationFocus(candidate);
  if (focus) return Promise.resolve(navigation.selectView(focus));
  if (candidate.symbol_id)
    return navigation.selectRelation({ symbol_id: candidate.symbol_id });
  return Promise.resolve(false);
}

// src/browser/relation-graph-view.ts
var RelationGraphView = class {
  constructor(navigation, onSelection) {
    this.navigation = navigation;
    this.onSelection = onSelection;
    this.graphController = new BrowserGraphController(
      navigation,
      () => false,
      (target) => this.navigateTarget(target)
    );
  }
  navigation;
  onSelection;
  graphController;
  graphCandidates = /* @__PURE__ */ new Map();
  render(source, controller) {
    const host = document.querySelector('[data-area="graph"]');
    if (!host) return;
    const groups = controller ? browserRelations.map((relation) => controller.state(relation)) : [];
    this.graphCandidates = graphCandidateMap(groups);
    const graph = graphFor(
      { symbol_id: source.symbol.symbol_id, name: source.symbol.name },
      groups
    );
    host.outerHTML = renderGraphArea(graph);
    this.bindGraphNodes(graph);
  }
  bindGraphNodes(graph) {
    const rendered = document.querySelector('[data-area="graph"]');
    for (const node of rendered?.querySelectorAll(
      "[data-focus]"
    ) ?? []) {
      const graphNode = graph.nodes.find(
        (candidate) => candidate.symbol_id === node.dataset.focus
      );
      node.addEventListener(
        "click",
        () => void this.graphController.select(graphNode).then((selected) => this.finishSelection(selected))
      );
    }
  }
  finishSelection(selected) {
    this.onSelection(selected);
  }
  navigateTarget(target) {
    const candidate = this.graphCandidates.get(target.symbol_id);
    return candidate ? navigateRelationCandidate(this.navigation, candidate) : this.navigation.selectRelation(target);
  }
};

// src/browser/relation-controller-reply.ts
function loadedRelationGroup(relation, reply) {
  if (reply.state !== "ok")
    return { relation, state: "failed", candidates: [], omitted_count: 0 };
  return {
    relation,
    state: "loaded",
    candidates: loadedCandidates(reply),
    omitted_count: omittedCount(reply)
  };
}
function loadedCandidates(reply) {
  return (reply.data?.candidates ?? []).map(
    (candidate) => withGeneration(candidate, reply.project_generation)
  );
}
function omittedCount(reply) {
  return reply.data?.omitted_count ?? 0;
}
function withGeneration(candidate, generation) {
  if (candidate.project_generation !== void 0 || generation === void 0)
    return candidate;
  return { ...candidate, project_generation: generation };
}

// src/browser/relation-controller.ts
var BrowserRelationsController = class {
  constructor(context, follow) {
    this.context = context;
    this.follow = follow;
    for (const relation of context.supported)
      this.groups.set(relation, {
        relation,
        state: "not_loaded",
        candidates: [],
        omitted_count: 0
      });
    for (const relation of context.unavailable)
      this.groups.set(relation, {
        relation,
        state: "unavailable",
        candidates: [],
        omitted_count: 0
      });
  }
  context;
  follow;
  groups = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  state(relation) {
    return this.groups.get(relation) ?? {
      relation,
      state: "unavailable",
      candidates: [],
      omitted_count: 0
    };
  }
  async open(relation) {
    const current = this.state(relation);
    if (current.state === "unavailable" || current.state === "loaded")
      return current;
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
  async load(relation) {
    try {
      const reply = await this.follow({
        view_id: this.context.view_id,
        handle: this.context.handle,
        relation,
        limit: 200
      });
      return this.save(loadedRelationGroup(relation, reply));
    } catch {
      return this.save({
        relation,
        state: "failed",
        candidates: [],
        omitted_count: 0
      });
    }
  }
  save(group) {
    this.groups.set(group.relation, group);
    return group;
  }
};

// src/browser/relation-follow.ts
async function followRelation(storage, request) {
  const reply = await browserRequest(storage, "api/follow", {
    request_id: crypto.randomUUID(),
    ...request
  });
  const data = Object(reply.data);
  return {
    state: reply.state === "unavailable_relation" ? reply.state : "ok",
    project_generation: reply.project_generation,
    data: {
      candidates: relationCandidates(data),
      omitted_count: typeof data.omitted_count === "number" ? data.omitted_count : 0
    }
  };
}

// src/browser/relation-pane-controller-support.ts
function createRelationController(storage, source, handle) {
  const supported = handle.relations.filter(isBrowserRelation);
  return new BrowserRelationsController(
    {
      view_id: source.view_id,
      handle: handle.handle,
      supported,
      unavailable: browserRelations.filter(
        (relation) => !supported.includes(relation)
      )
    },
    (request) => followRelation(storage, request)
  );
}

// src/browser/relation-pane-render.ts
function textElement(tag, text) {
  return Object.assign(document.createElement(tag), { textContent: text });
}
function resetRelationPane() {
  const pane = document.querySelector('[data-pane="relations"]');
  if (!pane) return;
  pane.dataset.state = "empty";
  pane.replaceChildren(
    textElement("h2", "Relations"),
    textElement("p", "No relations loaded")
  );
}
function renderRelationChoices(pane, handle, open) {
  pane.dataset.state = "empty";
  pane.replaceChildren(textElement("h2", "Relations"));
  for (const relation of handle.relations.filter(isBrowserRelation)) {
    const button = Object.assign(document.createElement("button"), {
      type: "button",
      textContent: relation
    });
    button.dataset.relation = relation;
    button.addEventListener("click", () => open(relation));
    pane.append(button);
  }
}
function renderRelationGroup(options) {
  const pane = document.querySelector('[data-pane="relations"]');
  if (!pane || !options.activeRelationKey?.startsWith(`${options.source.view_id}:`))
    return;
  pane.replaceChildren(textElement("h2", `Relations: ${options.relation}`));
  if (options.group.state !== "loaded") {
    pane.dataset.state = options.group.state;
    pane.append(textElement("p", options.group.state));
    return;
  }
  pane.dataset.state = "ready";
  renderLoadedGroup(pane, options.group, options.select);
}
function renderLoadedGroup(pane, group, select) {
  if (group.candidates.length === 0) {
    pane.append(textElement("p", "empty"));
    return;
  }
  for (const candidate of group.candidates)
    pane.append(relationElement(candidate, select));
}
function relationElement(candidate, select) {
  const label = relationName(candidate);
  if (candidate.external) return textElement("p", label);
  const button = Object.assign(document.createElement("button"), {
    type: "button",
    textContent: label
  });
  button.addEventListener("click", () => select(candidate));
  return button;
}

// src/browser/relation-pane-controller.ts
var RelationPaneController = class {
  constructor(storage, navigation, renderGraph, onSelection) {
    this.storage = storage;
    this.navigation = navigation;
    this.renderGraph = renderGraph;
    this.onSelection = onSelection;
  }
  storage;
  navigation;
  renderGraph;
  onSelection;
  relationControllers = /* @__PURE__ */ new Map();
  activeRelationKey;
  latestRelationRequest = {};
  reset() {
    this.activeRelationKey = void 0;
    this.latestRelationRequest = {};
    resetRelationPane();
  }
  showRelationChoices(source, handle) {
    const controller = this.relationController(source, handle);
    this.activeRelationKey = `${source.view_id}:${handle.handle}`;
    this.latestRelationRequest = {};
    const pane = document.querySelector('[data-pane="relations"]');
    if (!pane) return;
    renderRelationChoices(
      pane,
      handle,
      (relation) => void this.openRelation(source, handle, relation)
    );
    this.renderGraph(source, controller);
  }
  async openRelation(source, handle, relation) {
    const controller = this.relationController(source, handle);
    const request = {};
    this.latestRelationRequest = request;
    const group = await controller.open(relation);
    if (this.latestRelationRequest !== request || this.navigation.state().focus?.view_id !== source.view_id)
      return;
    renderRelationGroup({
      source,
      activeRelationKey: this.activeRelationKey,
      relation,
      group,
      select: (candidate) => this.selectCandidate(candidate)
    });
    this.renderGraph(source, controller);
  }
  relationController(source, handle) {
    const key = `${source.view_id}:${handle.handle}`;
    const existing = this.relationControllers.get(key);
    if (existing) return existing;
    const controller = createRelationController(this.storage, source, handle);
    this.relationControllers.set(key, controller);
    return controller;
  }
  selectCandidate(candidate) {
    void navigateRelationCandidate(this.navigation, candidate).then(
      (selected) => this.onSelection(selected)
    );
  }
};

// src/browser/source-boundary.ts
function isValidOffset(body, offset) {
  return Number.isInteger(offset) && offset >= 0 && offset <= body.length;
}
function isSurrogatePair(body, offset) {
  const before = body.charCodeAt(offset - 1);
  const after = body.charCodeAt(offset);
  return before >= 55296 && before <= 56319 && after >= 56320 && after <= 57343;
}
function validBoundary(body, offset) {
  if (!isValidOffset(body, offset)) return false;
  if (offset === 0 || offset === body.length) return true;
  return !isSurrogatePair(body, offset);
}

// src/browser/source-validation.ts
function validRange(body, handle, end) {
  return handle.start >= end && handle.start < handle.end && validBoundary(body, handle.start) && validBoundary(body, handle.end);
}
function validateHandles(body, handles) {
  const ordered = [...handles].sort(
    (left, right) => left.start - right.start || left.end - right.end
  );
  let end = 0;
  for (const handle of ordered) {
    if (!validRange(body, handle, end)) return void 0;
    end = handle.end;
  }
  return ordered;
}

// src/browser/source-segments.ts
function sourceSegments(body, handles) {
  const validated = validateHandles(body, handles);
  if (!validated) return void 0;
  const segments = [];
  let offset = 0;
  for (const handle of validated) {
    appendHandleSegments({ segments, body, handle, offset });
    offset = handle.end;
  }
  appendTailSegment(segments, body, offset);
  return segments;
}
function appendHandleSegments(options) {
  const { segments, body, handle, offset } = options;
  if (offset < handle.start)
    segments.push({ text: body.slice(offset, handle.start) });
  segments.push({ text: body.slice(handle.start, handle.end), handle });
}
function appendTailSegment(segments, body, offset) {
  if (offset < body.length || segments.length === 0)
    segments.push({ text: body.slice(offset) });
}

// src/browser/source-render.ts
function renderFragment(options) {
  const { fragment, segment, line, viewId } = options;
  const prefix = `<span class="source-line" data-line="${line}"></span>`;
  const text = escapeText(fragment);
  if (!segment.handle) return `${prefix}${text}`;
  const relations = segment.handle.relations.map(escapeText).join(" ");
  const handle = escapeText(segment.handle.handle);
  const view = escapeText(viewId);
  return `${prefix}<mark data-handle="${handle}" data-view-id="${view}" data-relations="${relations}">${text}</mark>`;
}
function renderTextWithLineNumbers(segments, viewId) {
  let line = 1;
  const rendered = [];
  for (const segment of segments) {
    const result = renderSegment(segment, line, viewId);
    rendered.push(...result.html);
    line = result.nextLine;
  }
  return rendered.join("");
}
function renderSegment(segment, line, viewId) {
  const fragments = segment.text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  const html = [];
  let nextLine = line;
  for (const fragment of fragments) {
    if (fragment.length === 0) continue;
    html.push(renderFragment({ fragment, segment, line: nextLine, viewId }));
    if (/\r\n|\r|\n$/.test(fragment)) nextLine += 1;
  }
  return { html, nextLine };
}
function renderFocusedSource(source) {
  const segments = sourceSegments(source.body, source.handles);
  if (!segments)
    return '<section data-state="invalid_browser_view">invalid_browser_view</section>';
  const metadata = `${escapeText(source.symbol.name)} \xC3\u201A\xC2\xB7 ${escapeText(source.symbol.kind)} \xC3\u201A\xC2\xB7 ${escapeText(source.symbol.path)} \xC3\u201A\xC2\xB7 ${escapeText(source.symbol.symbol_id)} \xC3\u201A\xC2\xB7 generation ${source.generation}`;
  const counts = `${source.returned_bytes} returned bytes \xC3\u201A\xC2\xB7 ${source.total_bytes} total bytes \xC3\u201A\xC2\xB7 ${source.limit_bytes} byte limit`;
  const viewId = escapeText(source.view_id);
  const body = renderTextWithLineNumbers(segments, source.view_id);
  return `<article class="focused-source" data-view-id="${viewId}" data-truncated="${source.truncated}"><header><p>${metadata}</p><p>${counts}</p></header><pre>${body}</pre></article>`;
}

// src/browser/relation-view.ts
var BrowserRelationView = class {
  constructor(storage, navigation) {
    this.navigation = navigation;
    this.graphView = new RelationGraphView(
      navigation,
      (selected) => this.finishSelection(selected)
    );
    this.paneController = new RelationPaneController(
      storage,
      navigation,
      (source, controller) => this.graphView.render(source, controller),
      (selected) => this.finishSelection(selected)
    );
  }
  navigation;
  graphView;
  paneController;
  renderFocusedView() {
    const source = this.navigation.state().focus?.source;
    if (!source) return;
    const host = document.querySelector('[data-area="source"]');
    if (host) host.innerHTML = renderFocusedSource(source);
    this.bindSourceRelations(source);
    this.paneController.reset();
    this.graphView.render(source);
  }
  bindSourceRelations(source) {
    for (const mark of document.querySelectorAll(
      "mark[data-handle]"
    )) {
      mark.addEventListener("click", () => {
        const handle = source.handles.find(
          (candidate) => candidate.handle === mark.dataset.handle
        );
        if (handle) this.paneController.showRelationChoices(source, handle);
      });
    }
  }
  finishSelection(selected) {
    if (selected) {
      this.renderFocusedView();
      showActionStatus("ready");
      return;
    }
    showActionStatus(this.navigation.state().error ?? "backend_unavailable");
  }
};

// src/browser/application.ts
function bindRefocus(navigation, focusSymbol) {
  document.querySelector('[data-operation="refocus"]')?.addEventListener("click", () => {
    const symbolId = navigation.state().focus?.symbol_id;
    if (symbolId) void focusSymbol(symbolId);
  });
}
function bindDiscovery(storage, focusSymbol) {
  let discovery = createDiscovery(storage, []);
  bindSymbols(focusSymbol);
  bindSearch(
    () => discovery,
    () => renderDiscoveryArea(discovery, focusSymbol)
  );
  loadLandmarks(storage, (landmarks) => {
    if (discovery.state().query) return;
    discovery = createDiscovery(storage, landmarks);
    renderDiscoveryArea(discovery, focusSymbol);
  });
}
function bindHistoryNavigation(navigation, relationView) {
  bindHistory((action) => handleHistory(action, navigation, relationView));
}
async function handleHistory(action, navigation, relationView) {
  const moved = action === "back" ? navigation.back() : navigation.forward();
  if (moved) {
    relationView.renderFocusedView();
    showActionStatus("ready");
    return;
  }
  showActionStatus("history_empty");
}
function startApplication(storage, startedState, root2) {
  const store = createBrowserStore({ status: startedState, landmarks: [] });
  root2.innerHTML = renderBrowserBody(store.state(), window.innerWidth);
  const navigation = createNavigation(storage);
  const relationView = new BrowserRelationView(storage, navigation);
  const focusController = new ApplicationFocusController(
    navigation,
    relationView
  );
  const focusSymbol = focusController.focusSymbol.bind(focusController);
  bindRefocus(navigation, focusSymbol);
  bindDiscovery(storage, focusSymbol);
  bindHistoryNavigation(navigation, relationView);
  bindRefresh(storage);
}

// src/browser/browser-session-policy.ts
function canRestore(navigation, storedSession, storedTab) {
  return navigation === "reload" && Boolean(storedSession) && Boolean(storedTab);
}
function isUsableRestore(reply) {
  return reply.state !== "browser_session_expired" && reply.state !== "invalid_browser_session";
}

// src/browser/browser-session-client.ts
var BrowserSessionClient = class {
  constructor(options) {
    this.options = options;
  }
  options;
  async start() {
    const navigation = this.options.navigationType();
    if (!navigation) return { state: "browser_capability_unavailable" };
    return this.startWithNavigation(navigation);
  }
  async startWithNavigation(navigation) {
    const storedSession = this.options.storage.get("browser_session_id");
    const storedTab = this.options.storage.get("tab_instance_id");
    const restore = canRestore(navigation, storedSession, storedTab);
    if (!restore) this.options.storage.clear();
    const tabId = restore ? storedTab ?? this.options.randomId() : this.options.randomId();
    return this.options.lock(
      `code-explorer-tab:${tabId}`,
      (available) => this.lockedStart({ available, restore, tabId, storedSession })
    );
  }
  async lockedStart(options) {
    if (!options.available) return this.unavailableStart(options.restore);
    if (!options.restore) return this.create(options.tabId);
    return this.restoreStart(options.tabId, options.storedSession);
  }
  async unavailableStart(restore) {
    if (!restore) return { state: "browser_capability_unavailable" };
    this.options.storage.clear();
    return this.create(this.options.randomId(), "browser_session_replaced");
  }
  async restoreStart(tabId, storedSession) {
    const reply = await this.options.request(
      { action: "restore", tab_instance_id: tabId, document_start: "reload" },
      {
        "x-code-explorer-session": storedSession ?? "",
        "x-code-explorer-tab": tabId
      }
    );
    if (isUsableRestore(reply)) return reply;
    return this.recoverExpired();
  }
  async recoverExpired() {
    this.options.storage.clear();
    return this.create(this.options.randomId(), "browser_session_expired");
  }
  async create(tabId, prior) {
    const reply = await this.options.request(
      { action: "create", tab_instance_id: tabId, document_start: "new" },
      { "x-code-explorer-tab": tabId }
    );
    const sessionId = reply.data?.browser_session_id;
    if (sessionId) {
      this.options.storage.set("tab_instance_id", tabId);
      this.options.storage.set("browser_session_id", sessionId);
    }
    return prior ? { ...reply, state: prior } : reply;
  }
};

// src/browser/client.ts
var root = document.querySelector("#code-explorer");
if (root) {
  root.textContent = "Loading Code Explorer";
  root.setAttribute("data-state", "loading");
  const storage = {
    get: (key) => sessionStorage.getItem(key),
    set: (key, value) => sessionStorage.setItem(key, value),
    clear: () => {
      sessionStorage.removeItem("browser_session_id");
      sessionStorage.removeItem("tab_instance_id");
    }
  };
  const session = new BrowserSessionClient({
    storage,
    navigationType: () => performance.getEntriesByType("navigation")[0]?.type,
    lock: async (name, action) => await navigator.locks.request(
      name,
      { ifAvailable: true },
      (lock) => action(lock !== null)
    ),
    randomId: () => crypto.randomUUID(),
    request: async (body, headers) => {
      const response = await fetch("api/session", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      return response.ok ? payload : { ...payload, state: payload.code ?? "workspace_unavailable" };
    }
  });
  void session.start().then((started) => {
    if (!ownership(storage)) throw new Error(started.state);
    const rootAccess = started.data?.root_access;
    const unavailableRoot = [
      "root_access_denied",
      "project_root_inaccessible",
      "project_root_unavailable"
    ].includes(rootAccess ?? "");
    const visibleState = unavailableRoot ? rootAccess ?? "workspace_unavailable" : started.state;
    root.textContent = `Code Explorer: ${visibleState}`;
    root.setAttribute(
      "data-state",
      unavailableRoot ? "unavailable" : "ready"
    );
    void browserRequest(storage, "api/status", { action: "status" }).catch(
      () => void 0
    );
    startApplication(storage, visibleState, root);
  }).catch(() => {
    root.textContent = "Code Explorer: workspace_unavailable";
    root.setAttribute("data-state", "unavailable");
  });
}
