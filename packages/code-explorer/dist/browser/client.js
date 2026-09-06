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
function escapeText(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function createBrowserStore(initial = {}) {
  let state = {
    landmarks: initial.landmarks ?? [],
    focus: initial.focus,
    activeDrawer: initial.activeDrawer,
    status: initial.status ?? "Project ready",
    navigationEnabled: initial.navigationEnabled ?? true
  };
  return {
    state: () => state,
    visibleOperations: () => visibleOperations,
    dispatch: (action) => {
      if (!visibleOperations.includes(action.operation))
        throw new Error("unsupported_browser_operation");
      if (action.operation === "focus" && action.symbol) state = { ...state, focus: action.symbol };
      if (action.operation === "set_drawer") state = { ...state, activeDrawer: action.drawer };
    }
  };
}
function renderLandmarks(landmarks) {
  if (landmarks.length === 0) return '<p data-state="empty">No landmarks available</p>';
  return landmarks.map(
    ({ group, items }) => `<section class="landmark-group"><h3>${escapeText(group)}</h3><ul>${items.map(
      (item) => typeof item === "string" ? `<li>${escapeText(item)}</li>` : `<li><button type="button" data-symbol-id="${escapeText(item.symbol_id)}">${escapeText(item.name)}</button> <span>${escapeText(item.kind)} \xB7 ${escapeText(item.path)}</span></li>`
    ).join("")}</ul></section>`
  ).join("");
}
function drawerButton(name, open) {
  const label = name === "discovery" ? "Discovery" : "Relations";
  return `<button type="button" data-drawer="${name}" aria-controls="${name}-pane" aria-expanded="${open}">${label}</button>`;
}
function renderBrowserBody(state, viewportWidth) {
  const narrow = viewportWidth < 900;
  const discoveryDrawer = narrow ? drawerButton("discovery", state.activeDrawer === "discovery") : "";
  const relationDrawer = narrow ? drawerButton("relations", state.activeDrawer === "relations") : "";
  const focus = state.focus ? `<article class="focused-symbol"><h2>${escapeText(state.focus.name)}</h2><p>${escapeText(state.focus.kind)} \xB7 ${escapeText(state.focus.path)}</p></article>` : '<p data-state="empty-focus">Select a symbol</p>';
  const disabled = state.navigationEnabled ? "" : " disabled";
  return `<header class="status-strip"><span data-area="status">${escapeText(state.status)}</span><nav aria-label="Navigation"><button type="button" data-operation="back"${disabled}>Back</button><button type="button" data-operation="forward"${disabled}>Forward</button><button type="button" data-operation="refocus"${disabled}>Refocus</button><button type="button" data-operation="refresh">Refresh</button></nav></header><main class="explorer-shell ${narrow ? "narrow" : "desktop"}">${discoveryDrawer}<aside id="discovery-pane" data-pane="discovery"><h2>Landmarks</h2><label>Search <input type="search" data-operation="search"${disabled}></label><div data-area="discovery">${renderLandmarks(state.landmarks)}</div></aside><section data-pane="focus"><h1>Focused source</h1><div data-area="source">${focus}</div><div data-area="graph" data-state="empty">No graph loaded</div></section><aside id="relations-pane" data-pane="relations"><h2>Relations</h2><p data-state="empty-relations">No relations loaded</p></aside>${relationDrawer}</main>`;
}

// src/browser/source-handles.ts
function sourceHandles(data, body) {
  const candidates = Array.isArray(data.handles) ? data.handles : [];
  const handles = [];
  for (const value of candidates) {
    if (!value || typeof value !== "object") continue;
    const candidate = value;
    if (typeof candidate.handle !== "string" || typeof candidate.start !== "number" || typeof candidate.end !== "number" || !Array.isArray(candidate.relations) || candidate.out_of_range === true)
      continue;
    if (!(Number.isInteger(candidate.start) && Number.isInteger(candidate.end))) continue;
    if (candidate.start < 0 || candidate.end > body.length) continue;
    const relations = candidate.relations.filter((relation) => typeof relation === "string");
    handles.push({ handle: candidate.handle, start: candidate.start, end: candidate.end, relations });
  }
  return handles;
}

// src/browser/browser-reply.ts
function landmarkItem(value) {
  if (!value || typeof value !== "object") return void 0;
  const item = value;
  if (!hasStrings(item, ["symbol_id", "name", "path", "kind"])) return void 0;
  return { symbol_id: item.symbol_id, name: item.name, path: item.path, kind: item.kind };
}
function compactLandmarkItem(value) {
  const item = landmarkItem(value);
  return item ? [item] : [];
}
function landmarkGroup(value) {
  if (!value || typeof value !== "object") return void 0;
  const candidate = value;
  if (!hasStrings(candidate, ["group"])) return void 0;
  if (!Array.isArray(candidate.symbols)) return void 0;
  return {
    group: candidate.group,
    items: candidate.symbols.flatMap(compactLandmarkItem)
  };
}
function landmarkGroups(reply) {
  const groups = Array.isArray(reply.data?.landmarks) ? reply.data.landmarks : [];
  return groups.flatMap((value) => {
    const group = landmarkGroup(value);
    return group ? [group] : [];
  });
}
function sourceGeneration(reply) {
  if (typeof reply.data?.project_generation === "number") return reply.data.project_generation;
  return typeof reply.project_generation === "number" ? reply.project_generation : 0;
}
function hasStrings(value, keys) {
  return keys.every((key) => typeof value[key] === "string");
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
  if (!hasStrings(data, ["view_id", "symbol_id", "name", "kind", "path"])) return void 0;
  if (typeof body !== "string") return void 0;
  return {
    view_id: data.view_id,
    symbol: { name: data.name, kind: data.kind, path: data.path, symbol_id: data.symbol_id },
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

// src/browser/discovery.ts
var latestSearches = /* @__PURE__ */ new WeakMap();
function escapeText2(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
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
  async search(query, filters = {}) {
    latestSearches.delete(this);
    const normalized = query.trim();
    if (normalized.length === 0) {
      this.current = {
        ...this.current,
        query: "",
        filters,
        candidates: [],
        omittedCount: 0,
        refinementGuidance: void 0,
        mode: "landmarks",
        areaState: "not_loaded",
        error: void 0
      };
      return this.current;
    }
    const request = { query: normalized };
    latestSearches.set(this, request);
    if (filters.path_globs) request.path_globs = [...filters.path_globs];
    if (filters.languages) request.languages = [...filters.languages];
    if (filters.kinds) request.kinds = [...filters.kinds];
    if (filters.content) request.content = filters.content;
    if (filters.include_generated !== void 0) request.include_generated = filters.include_generated;
    this.current = { ...this.current, query: normalized, filters, areaState: "loading", error: void 0 };
    try {
      const reply = await this.searchCore(request);
      if (latestSearches.get(this) !== request) return this.current;
      const candidates = reply.data.candidates ?? [];
      this.current = {
        ...this.current,
        candidates,
        omittedCount: reply.data.omitted_candidate_count ?? reply.data.omitted_count ?? 0,
        refinementGuidance: reply.data.refinement_guidance,
        mode: "results",
        areaState: candidates.length === 0 ? "empty" : "ready"
      };
    } catch {
      if (latestSearches.get(this) !== request) return this.current;
      this.current = { ...this.current, mode: "results", areaState: "failed", error: "backend_unavailable" };
    }
    return this.current;
  }
};
function renderLandmarks2(landmarks) {
  return landmarks.map(
    (group) => `<section class="landmark-group"><h3>${escapeText2(group.group)}</h3><ul>${group.items.map(
      (item) => `<li>${item.symbol_id ? `<button type="button" data-symbol-id="${escapeText2(item.symbol_id)}">${escapeText2(item.name)}</button>` : escapeText2(item.name)} <span>${escapeText2(item.kind)} \xB7 ${escapeText2(item.path)}</span></li>`
    ).join("")}</ul></section>`
  ).join("");
}
function renderDiscovery(state) {
  if (state.areaState !== "ready" && state.areaState !== "empty" && state.areaState !== "not_loaded")
    return `<section data-discovery="results" data-state="${state.areaState}">${state.error ?? state.areaState}</section>`;
  if (state.mode === "landmarks")
    return `<section data-discovery="landmarks">${renderLandmarks2(state.landmarks)}</section>`;
  const candidates = state.candidates.map((candidate) => {
    const name = candidate.type === "file" ? candidate.path.split("/").at(-1) ?? candidate.path : candidate.name;
    const kind = candidate.type === "file" ? "file" : candidate.kind;
    const label = candidate.identity ? `<button type="button" data-symbol-id="${escapeText2(candidate.identity)}">${escapeText2(name)}</button>` : `<strong>${escapeText2(name)}</strong>`;
    return `<li data-match-class="${escapeText2(candidate.match_class)}">${label} <span>${escapeText2(candidate.match_class)} ${candidate.match_score}</span> <span>${escapeText2(candidate.path)} \xB7 ${escapeText2(kind)}</span></li>`;
  }).join("");
  const omitted = state.omittedCount > 0 ? `<p>${state.omittedCount} omitted</p>` : "";
  const guidance = state.refinementGuidance ? `<p>${escapeText2(state.refinementGuidance)}</p>` : "";
  return `<section data-discovery="results" data-state="${state.areaState}"><ul>${candidates}</ul>${omitted}${guidance}</section>`;
}

// src/browser/application-discovery.ts
function bindSymbols(focus) {
  for (const button of document.querySelectorAll("[data-symbol-id]")) {
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
  void browserRequest(storage, "api/search", { request_id: crypto.randomUUID(), query: "" }).then((reply) => apply(landmarkGroups(reply))).catch(() => void 0);
}

// src/browser/application-events.ts
function showActionError(error) {
  showActionStatus(error instanceof Error ? error.message : "backend_unavailable");
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
  document.querySelector('[data-operation="refresh"]')?.addEventListener("click", async () => {
    try {
      const reply = await request(storage, "api/status", { action: "refresh", request_id: crypto.randomUUID() });
      showActionStatus(reply.state ?? "ready");
      onSuccess?.();
    } catch (error) {
      showActionError(error);
    }
  });
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
    const selected = await this.navigation.selectSearch({ symbol_id: symbolId });
    if (request !== this.latestFocusRequest) return;
    if (selected) {
      this.relationView.renderFocusedView();
      showActionStatus("ready");
      return;
    }
    showActionStatus(this.navigation.state().error ?? "backend_unavailable");
  }
};

// src/browser/focus-navigation.ts
var BrowserFocusNavigation = class {
  constructor(initial, focusCore) {
    this.focusCore = focusCore;
    this.current = initial ? { focus: initial, history: [initial], historyPosition: 0 } : { history: [], historyPosition: -1 };
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
    if (this.current.historyPosition <= 0) return false;
    this.requestSequence += 1;
    const historyPosition = this.current.historyPosition - 1;
    const focus = this.current.history[historyPosition];
    if (!focus) return false;
    this.current = { ...this.current, focus, historyPosition, error: void 0 };
    return true;
  }
  forward() {
    if (this.current.historyPosition >= this.current.history.length - 1) return false;
    const historyPosition = this.current.historyPosition + 1;
    const focus = this.current.history[historyPosition];
    if (!focus) return false;
    this.requestSequence += 1;
    this.current = { ...this.current, focus, historyPosition, error: void 0 };
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
    if (reply.state !== "ok" || !reply.data) {
      this.current = { ...this.current, error: reply.state };
      return false;
    }
    this.commit(reply.data);
    return true;
  }
  commit(focus) {
    const history = [...this.current.history.slice(0, this.current.historyPosition + 1), focus];
    this.current = { focus, history, historyPosition: history.length - 1, error: void 0 };
  }
};

// src/browser/graph.ts
var relationOrder = [
  "definition",
  "references",
  "callers",
  "callees",
  "type",
  "implementations"
];
var relationLabel = {
  definition: "definition",
  references: "reference",
  callers: "caller",
  callees: "callee",
  type: "type",
  implementations: "implementation"
};
function normalizedIdentity(symbol_id) {
  return symbol_id.trim().normalize("NFC");
}
function isLocalSemanticCandidate(candidate) {
  return candidate.external !== true && candidate.discovery_only !== true && normalizedIdentity(candidate.symbol_id).length > 0;
}
function edgeFor(relation, candidate, focusId) {
  const candidateId = normalizedIdentity(candidate.symbol_id);
  const incoming = relation === "references" || relation === "callers";
  return {
    from: incoming ? candidateId : focusId,
    to: incoming ? focusId : candidateId,
    label: relationLabel[relation]
  };
}
function projectOneHopGraph(focus, groups) {
  const focusId = normalizedIdentity(focus.symbol_id);
  if (focusId.length === 0) throw new Error("invalid_graph_focus");
  const nodes = /* @__PURE__ */ new Map([
    [focusId, { symbol_id: focusId, name: focus.name, center: true, selectable: false }]
  ]);
  const edges = [];
  const omitted = /* @__PURE__ */ new Map();
  const byRelation = new Map(groups.map((group) => [group.relation, group]));
  for (const relation of relationOrder) {
    const group = byRelation.get(relation);
    if (group?.state !== "loaded") continue;
    if (group.omitted_count > 0) omitted.set(relation, group.omitted_count);
    for (const candidate of group.candidates) {
      if (!isLocalSemanticCandidate(candidate)) continue;
      const symbol_id = normalizedIdentity(candidate.symbol_id);
      if (!nodes.has(symbol_id))
        nodes.set(symbol_id, { symbol_id, name: candidate.name, center: false, selectable: true });
      edges.push(edgeFor(relation, candidate, focusId));
    }
  }
  return { nodes: [...nodes.values()], edges, omitted };
}
function escapeText3(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function edgeLane(edge) {
  return edge.label === "caller" || edge.label === "reference" ? "incoming" : "outgoing";
}
function nodePositions(graph) {
  const positions = /* @__PURE__ */ new Map();
  const rows = { incoming: 0, center: 0, outgoing: 0 };
  for (const node of graph.nodes) {
    const firstEdge = graph.edges.find((edge) => edge.from === node.symbol_id || edge.to === node.symbol_id);
    const lane = node.center ? "center" : firstEdge ? edgeLane(firstEdge) : "outgoing";
    rows[lane] += 1;
    positions.set(node.symbol_id, {
      lane,
      x: lane === "incoming" ? "16%" : lane === "center" ? "50%" : "84%",
      y: rows[lane] * 48
    });
  }
  return positions;
}
function renderOneHopGraph(graph) {
  const positions = nodePositions(graph);
  const edgeMarkup = graph.edges.map((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!(from && to)) throw new Error("invalid_graph_projection");
    const direction = edgeLane(edge);
    return `<path data-edge-label="${edge.label}" data-direction="${direction}" d="M ${from.x} ${from.y} L ${to.x} ${to.y}" marker-end="url(#graph-arrow)"/>`;
  }).join("");
  const nodeMarkup = graph.nodes.map((node) => {
    const position = positions.get(node.symbol_id);
    if (!position) throw new Error("invalid_graph_projection");
    const selection = node.selectable ? ` data-focus="${escapeText3(node.symbol_id)}"` : "";
    return `<text data-node-id="${escapeText3(node.symbol_id)}" data-lane="${position.lane}" x="${position.x}" y="${position.y}"${selection}>${escapeText3(node.name)}</text>`;
  }).join("");
  const omittedMarkup = [...graph.omitted.entries()].map(([relation, count]) => `<text data-omitted-relation="${relation}">${count} omitted</text>`).join("");
  return `<svg data-graph="one-hop" viewBox="0 0 100 100" role="img"><defs><marker id="graph-arrow" markerWidth="4" markerHeight="4" refX="4" refY="2" orient="auto"><path d="M 0 0 L 4 2 L 0 4 z"/></marker></defs>${edgeMarkup}${nodeMarkup}${omittedMarkup}</svg>`;
}

// src/browser/graph-navigation.ts
function graphName(candidate) {
  return candidate.name ?? candidate.display_name ?? candidate.symbol_id ?? "";
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
var BrowserGraphController = class {
  constructor(navigation, isStale, selectTarget = (target) => navigation.selectRelation(target)) {
    this.navigation = navigation;
    this.isStale = isStale;
    this.selectTarget = selectTarget;
  }
  navigation;
  isStale;
  selectTarget;
  graphFor(focus, groups) {
    return projectOneHopGraph(focus, toGraphRelationGroups(groups));
  }
  async select(node) {
    if (!node?.selectable || this.isStale()) return false;
    const target = { symbol_id: node.symbol_id };
    return this.selectTarget(target);
  }
};
function renderGraphArea(graph, options = {}) {
  if (options.collapsed) return '<section data-area="graph" data-state="collapsed">collapsed</section>';
  try {
    const svg = renderOneHopGraph(graph);
    if (options.stale) return `<section data-area="graph" data-state="stale">stale${svg}</section>`;
    return `<section data-area="graph" data-state="ready">${svg}</section>`;
  } catch {
    return '<section data-area="graph" data-state="failed">graph_render_failed</section>';
  }
}

// src/browser/source.ts
function escapeText4(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function validBoundary(body, offset) {
  if (!Number.isInteger(offset) || offset < 0 || offset > body.length) return false;
  if (offset === 0 || offset === body.length) return true;
  const before = body.charCodeAt(offset - 1);
  const after = body.charCodeAt(offset);
  return !(before >= 55296 && before <= 56319 && after >= 56320 && after <= 57343);
}
function validateHandles(body, handles) {
  const ordered = [...handles].sort((left, right) => left.start - right.start || left.end - right.end);
  let end = 0;
  for (const handle of ordered) {
    if (handle.start < end || handle.start >= handle.end) return void 0;
    if (!(validBoundary(body, handle.start) && validBoundary(body, handle.end))) return void 0;
    end = handle.end;
  }
  return ordered;
}
function sourceSegments(body, handles) {
  const validated = validateHandles(body, handles);
  if (!validated) return void 0;
  const segments = [];
  let offset = 0;
  for (const handle of validated) {
    if (offset < handle.start) segments.push({ text: body.slice(offset, handle.start) });
    segments.push({ text: body.slice(handle.start, handle.end), handle });
    offset = handle.end;
  }
  if (offset < body.length || segments.length === 0) segments.push({ text: body.slice(offset) });
  return segments;
}
function renderTextWithLineNumbers(segments, viewId) {
  let line = 1;
  const rendered = [];
  for (const segment of segments) {
    const fragments = segment.text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
    for (const fragment of fragments) {
      if (fragment.length === 0) continue;
      const text = escapeText4(fragment);
      const linePrefix = `<span class="source-line" data-line="${line}"></span>`;
      if (!segment.handle) rendered.push(`${linePrefix}${text}`);
      else {
        const relations = segment.handle.relations.map(escapeText4).join(" ");
        rendered.push(
          `${linePrefix}<mark data-handle="${escapeText4(segment.handle.handle)}" data-view-id="${escapeText4(viewId)}" data-relations="${relations}">${text}</mark>`
        );
      }
      if (/\r\n|\r|\n$/.test(fragment)) line += 1;
    }
  }
  return rendered.join("");
}
function renderFocusedSource(source) {
  const segments = sourceSegments(source.body, source.handles);
  if (!segments) return '<section data-state="invalid_browser_view">invalid_browser_view</section>';
  const metadata = `${escapeText4(source.symbol.name)} \xB7 ${escapeText4(source.symbol.kind)} \xB7 ${escapeText4(source.symbol.path)} \xB7 ${escapeText4(source.symbol.symbol_id)} \xB7 generation ${source.generation}`;
  const counts = `${source.returned_bytes} returned bytes \xB7 ${source.total_bytes} total bytes \xB7 ${source.limit_bytes} byte limit`;
  return `<article class="focused-source" data-view-id="${escapeText4(source.view_id)}" data-truncated="${source.truncated}"><header><p>${metadata}</p><p>${counts}</p></header><pre>${renderTextWithLineNumbers(segments, source.view_id)}</pre></article>`;
}

// src/browser/relations.ts
function preserveGeneration(candidate, generation) {
  if (candidate.project_generation !== void 0 || generation === void 0) return candidate;
  return { ...candidate, project_generation: generation };
}
var BrowserRelationsController = class {
  constructor(context, follow) {
    this.context = context;
    this.follow = follow;
    for (const relation of context.supported)
      this.groups.set(relation, { relation, state: "not_loaded", candidates: [], omitted_count: 0 });
    for (const relation of context.unavailable)
      this.groups.set(relation, { relation, state: "unavailable", candidates: [], omitted_count: 0 });
  }
  context;
  follow;
  groups = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  state(relation) {
    return this.groups.get(relation) ?? { relation, state: "unavailable", candidates: [], omitted_count: 0 };
  }
  async open(relation) {
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
  async load(relation) {
    try {
      const reply = await this.follow({
        view_id: this.context.view_id,
        handle: this.context.handle,
        relation,
        limit: 200
      });
      if (reply.state !== "ok") return this.save({ relation, state: "failed", candidates: [], omitted_count: 0 });
      return this.save({
        relation,
        state: "loaded",
        candidates: (reply.data?.candidates ?? []).map(
          (candidate) => preserveGeneration(candidate, reply.project_generation)
        ),
        omitted_count: reply.data?.omitted_count ?? 0
      });
    } catch {
      return this.save({ relation, state: "failed", candidates: [], omitted_count: 0 });
    }
  }
  save(group) {
    this.groups.set(group.relation, group);
    return group;
  }
};
var browserRelations = ["definition", "references", "callers", "callees", "type", "implementation"];
function isBrowserRelation(value) {
  return browserRelations.includes(value);
}
function relationFocus(candidate) {
  if (!hasFocusPayload(candidate)) return;
  const body = relationBody(candidate.content);
  if (typeof body !== "string") return;
  const returnedBytes = relationReturnedBytes(candidate.content, body);
  const totalBytes = relationTotalBytes(candidate.content, returnedBytes);
  const handles = relationHandles(candidate);
  const source = {
    view_id: candidate.view_id,
    symbol: {
      name: relationName(candidate),
      kind: candidate.kind,
      path: candidate.path,
      symbol_id: candidate.symbol_id
    },
    generation: relationGeneration(candidate),
    body,
    handles,
    returned_bytes: returnedBytes,
    total_bytes: totalBytes,
    limit_bytes: relationLimit(candidate.content, totalBytes),
    truncated: candidate.content.truncated === true
  };
  return { view_id: source.view_id, symbol_id: source.symbol.symbol_id, name: source.symbol.name, source };
}
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
  return Boolean(candidate.view_id && candidate.symbol_id && candidate.path && candidate.kind && candidate.content);
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
function relationCandidates(data) {
  if (Array.isArray(data.candidates)) return data.candidates;
  if (data.focus && typeof data.focus === "object") return [data.focus];
  return [];
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
function textElement(tag, text) {
  return Object.assign(document.createElement(tag), { textContent: text });
}
var BrowserRelationView = class {
  constructor(storage, navigation) {
    this.storage = storage;
    this.navigation = navigation;
    this.graphController = new BrowserGraphController(
      navigation,
      () => false,
      (target) => this.navigateTarget(target)
    );
  }
  storage;
  navigation;
  relationControllers = /* @__PURE__ */ new Map();
  graphController;
  activeRelationKey;
  latestRelationRequest = {};
  graphCandidates = /* @__PURE__ */ new Map();
  renderFocusedView() {
    const source = this.navigation.state().focus?.source;
    if (!source) return;
    const host = document.querySelector('[data-area="source"]');
    if (host) host.innerHTML = renderFocusedSource(source);
    this.bindSourceRelations(source);
    this.resetRelations();
    this.renderGraph(source);
  }
  bindSourceRelations(source) {
    for (const mark of document.querySelectorAll("mark[data-handle]")) {
      mark.addEventListener("click", () => {
        const handle = source.handles.find((candidate) => candidate.handle === mark.dataset.handle);
        if (handle) this.showRelationChoices(source, handle);
      });
    }
  }
  resetRelations() {
    this.activeRelationKey = void 0;
    this.latestRelationRequest = {};
    const pane = document.querySelector('[data-pane="relations"]');
    if (!pane) return;
    pane.dataset.state = "empty";
    pane.replaceChildren(textElement("h2", "Relations"), textElement("p", "No relations loaded"));
  }
  renderGraph(source, controller) {
    const host = document.querySelector('[data-area="graph"]');
    if (!host) return;
    const groups = controller ? browserRelations.map((relation) => controller.state(relation)) : [];
    this.graphCandidates = graphCandidateMap(groups);
    const graph = this.graphController.graphFor(
      { symbol_id: source.symbol.symbol_id, name: source.symbol.name },
      groups
    );
    host.outerHTML = renderGraphArea(graph);
    this.bindGraphNodes(graph);
  }
  bindGraphNodes(graph) {
    const rendered = document.querySelector('[data-area="graph"]');
    for (const node of rendered?.querySelectorAll("[data-focus]") ?? []) {
      const graphNode = graph.nodes.find((candidate) => candidate.symbol_id === node.dataset.focus);
      node.addEventListener(
        "click",
        () => void this.graphController.select(graphNode).then((selected) => this.finishSelection(selected))
      );
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
  navigateTarget(target) {
    const candidate = this.graphCandidates.get(target.symbol_id);
    return candidate ? this.navigateCandidate(candidate) : this.navigation.selectRelation(target);
  }
  navigateCandidate(candidate) {
    const focus = relationFocus(candidate);
    if (focus) return Promise.resolve(this.navigation.selectView(focus));
    if (candidate.symbol_id) return this.navigation.selectRelation({ symbol_id: candidate.symbol_id });
    return Promise.resolve(false);
  }
  relationController(source, handle) {
    const key = `${source.view_id}:${handle.handle}`;
    const existing = this.relationControllers.get(key);
    if (existing) return existing;
    const supported = handle.relations.filter(isBrowserRelation);
    const controller = new BrowserRelationsController(
      {
        view_id: source.view_id,
        handle: handle.handle,
        supported,
        unavailable: browserRelations.filter((relation) => !supported.includes(relation))
      },
      (request) => this.follow(request)
    );
    this.relationControllers.set(key, controller);
    return controller;
  }
  async follow(request) {
    const reply = await browserRequest(this.storage, "api/follow", {
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
  showRelationChoices(source, handle) {
    const controller = this.relationController(source, handle);
    this.activeRelationKey = `${source.view_id}:${handle.handle}`;
    this.latestRelationRequest = {};
    const pane = document.querySelector('[data-pane="relations"]');
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
  async openRelation(source, handle, relation) {
    const controller = this.relationController(source, handle);
    const request = {};
    this.latestRelationRequest = request;
    const group = await controller.open(relation);
    if (this.latestRelationRequest !== request || this.navigation.state().focus?.view_id !== source.view_id) return;
    this.renderRelationGroup(source, relation, group);
    this.renderGraph(source, controller);
  }
  renderRelationGroup(source, relation, group) {
    const pane = this.activeRelationsPane(source);
    if (!pane) return;
    pane.dataset.state = relationPaneState(group);
    pane.replaceChildren(textElement("h2", `Relations: ${relation}`));
    if (group.state !== "loaded") return void pane.append(textElement("p", group.state));
    if (group.candidates.length === 0) return void pane.append(textElement("p", "empty"));
    for (const candidate of group.candidates) pane.append(this.relationElement(candidate));
  }
  activeRelationsPane(source) {
    const pane = document.querySelector('[data-pane="relations"]');
    if (!pane) return;
    if (!this.activeRelationKey?.startsWith(`${source.view_id}:`)) return;
    return pane;
  }
  relationElement(candidate) {
    const label = relationName(candidate);
    if (candidate.external) return textElement("p", label);
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: label });
    button.addEventListener("click", () => this.selectCandidate(candidate));
    return button;
  }
  selectCandidate(candidate) {
    void this.navigateCandidate(candidate).then((selected) => this.finishSelection(selected));
  }
};
function relationPaneState(group) {
  return group.state === "loaded" ? "ready" : group.state;
}

// src/browser/application.ts
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
    async ({ symbol_id }) => focusReply(
      await browserRequest(storage, "api/focus", {
        request_id: crypto.randomUUID(),
        symbol_id
      })
    )
  );
}
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
  bindHistory(async (action) => {
    const moved = action === "back" ? navigation.back() : navigation.forward();
    if (moved) {
      relationView.renderFocusedView();
      showActionStatus("ready");
      return;
    }
    showActionStatus("history_empty");
  });
}
function startApplication(storage, startedState, root2) {
  const store = createBrowserStore({ status: startedState, landmarks: [] });
  root2.innerHTML = renderBrowserBody(store.state(), window.innerWidth);
  const navigation = createNavigation(storage);
  const relationView = new BrowserRelationView(storage, navigation);
  const focusController = new ApplicationFocusController(navigation, relationView);
  const focusSymbol = focusController.focusSymbol.bind(focusController);
  bindRefocus(navigation, focusSymbol);
  bindDiscovery(storage, focusSymbol);
  bindHistoryNavigation(navigation, relationView);
  bindRefresh(storage);
}

// src/browser/session.ts
var BrowserSessionClient = class {
  constructor(options) {
    this.options = options;
  }
  options;
  async start() {
    const navigation = this.options.navigationType();
    if (!navigation) return { state: "browser_capability_unavailable" };
    const storedSession = this.options.storage.get("browser_session_id");
    const storedTab = this.options.storage.get("tab_instance_id");
    const restore = navigation === "reload" && !!storedSession && !!storedTab;
    if (!restore) this.options.storage.clear();
    const tabId = restore ? storedTab ?? this.options.randomId() : this.options.randomId();
    return this.options.lock(`code-explorer-tab:${tabId}`, async (available) => {
      if (!available) {
        if (!restore) return { state: "browser_capability_unavailable" };
        this.options.storage.clear();
        return this.create(this.options.randomId(), "browser_session_replaced");
      }
      if (restore) {
        const reply = await this.options.request(
          { action: "restore", tab_instance_id: tabId, document_start: "reload" },
          { "x-code-explorer-session": storedSession ?? "", "x-code-explorer-tab": tabId }
        );
        if (reply.state !== "browser_session_expired" && reply.state !== "invalid_browser_session") return reply;
        return this.recoverExpired();
      }
      return this.create(tabId);
    });
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
    lock: async (name, action) => await navigator.locks.request(name, { ifAvailable: true }, (lock) => action(lock !== null)),
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
    const unavailableRoot = ["root_access_denied", "project_root_inaccessible", "project_root_unavailable"].includes(
      rootAccess ?? ""
    );
    const visibleState = unavailableRoot ? rootAccess ?? "workspace_unavailable" : started.state;
    root.textContent = `Code Explorer: ${visibleState}`;
    root.setAttribute("data-state", unavailableRoot ? "unavailable" : "ready");
    void browserRequest(storage, "api/status", { action: "status" }).catch(() => void 0);
    startApplication(storage, visibleState, root);
  }).catch(() => {
    root.textContent = "Code Explorer: workspace_unavailable";
    root.setAttribute("data-state", "unavailable");
  });
}
