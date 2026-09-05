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

// src/browser/application-events.ts
function showActionError(error) {
  showActionStatus(error instanceof Error ? error.message : "backend_unavailable");
}
function showActionStatus(value) {
  const status = document.querySelector('[data-area="status"]');
  if (status) status.textContent = value;
}
function bindHistory(storage, navigate) {
  for (const operation of ["back", "forward"]) {
    document.querySelector(`[data-operation="${operation}"]`)?.addEventListener("click", () => {
      void navigate(
        () => browserRequest(storage, "api/history", { request_id: crypto.randomUUID(), action: operation })
      );
    });
  }
}
function bindRefresh(storage) {
  document.querySelector('[data-operation="refresh"]')?.addEventListener("click", async () => {
    try {
      const reply = await browserRequest(storage, "api/status", { action: "refresh", request_id: crypto.randomUUID() });
      const status = document.querySelector('[data-area="status"]');
      if (status) status.textContent = reply.state ?? "ready";
    } catch (error) {
      showActionError(error);
    }
  });
}

// src/browser/source-handles.ts
var relationNames = ["definition", "references", "callers", "callees", "type", "implementation"];
function sourceHandles(data, body) {
  const candidates = Array.isArray(data.handles) ? data.handles : [];
  const handles = [];
  let occupiedUntil = 0;
  for (const value of candidates) {
    if (!value || typeof value !== "object") continue;
    const candidate = value;
    if (typeof candidate.handle !== "string" || typeof candidate.name !== "string") continue;
    const start = body.indexOf(candidate.name, occupiedUntil);
    if (start < 0) continue;
    const end = start + candidate.name.length;
    handles.push({ handle: candidate.handle, start, end, relations: relationNames });
    occupiedUntil = end;
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

// src/browser/source-relations.ts
var latestRelationRequests = /* @__PURE__ */ new WeakMap();
function resetRelationPane(pane) {
  latestRelationRequests.set(pane, {});
  pane.dataset.state = "empty";
  const empty = Object.assign(document.createElement("p"), { textContent: "No relations loaded" });
  empty.dataset.state = "empty-relations";
  pane.replaceChildren(Object.assign(document.createElement("h2"), { textContent: "Relations" }), empty);
}
function resetSourceRelations() {
  const pane = document.querySelector('[data-pane="relations"]');
  if (pane) resetRelationPane(pane);
}
function relationCandidates(reply) {
  const data = Object(reply.data);
  if (Array.isArray(data.candidates)) return data.candidates;
  return data.focus ? [data.focus] : [];
}
function appendCandidates(pane, values, focus) {
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const candidate = value;
    const label = String(candidate.display_name ?? candidate.name ?? candidate.symbol_id ?? "relation");
    if (typeof candidate.symbol_id !== "string") {
      pane.append(Object.assign(document.createElement("p"), { textContent: label }));
      continue;
    }
    const target = Object.assign(document.createElement("button"), { type: "button", textContent: label });
    target.addEventListener("click", () => void focus(candidate.symbol_id));
    pane.append(target);
  }
}
async function followRelation(pane, storage, focus, input) {
  const request = {};
  latestRelationRequests.set(pane, request);
  pane.dataset.state = "loading";
  try {
    const reply = await browserRequest(storage, "api/follow", {
      request_id: crypto.randomUUID(),
      view_id: input.viewId,
      handle: input.handle,
      relation: input.relation,
      limit: 50
    });
    if (latestRelationRequests.get(pane) !== request) return;
    pane.replaceChildren(Object.assign(document.createElement("h2"), { textContent: `Relations: ${input.relation}` }));
    pane.dataset.state = reply.state ?? "ready";
    const candidates = relationCandidates(reply);
    if (candidates.length === 0)
      pane.append(Object.assign(document.createElement("p"), { textContent: reply.state ?? "empty" }));
    appendCandidates(pane, candidates, focus);
  } catch (error) {
    if (latestRelationRequests.get(pane) !== request) return;
    pane.dataset.state = "failed";
    pane.append(
      Object.assign(document.createElement("p"), {
        textContent: error instanceof Error ? error.message : "backend_unavailable"
      })
    );
  }
}
function bindSourceRelations(storage, focus) {
  const pane = document.querySelector('[data-pane="relations"]');
  if (!pane) return;
  for (const mark of document.querySelectorAll("mark[data-handle]")) {
    mark.addEventListener("click", () => {
      const handle = mark.dataset.handle;
      const viewId = mark.dataset.viewId;
      resetRelationPane(pane);
      if (!(handle && viewId)) return;
      for (const relation of mark.dataset.relations?.split(" ").filter(Boolean) ?? []) {
        const button = Object.assign(document.createElement("button"), { type: "button", textContent: relation });
        button.dataset.relation = relation;
        button.addEventListener("click", () => void followRelation(pane, storage, focus, { handle, viewId, relation }));
        pane.append(button);
      }
    });
  }
}

// src/browser/focus-actions.ts
function renderFocus(reply, setCurrent, afterRender) {
  const source = focusedSource(reply);
  if (!source) throw new Error("invalid_browser_view");
  setCurrent(source.symbol.symbol_id);
  const sourceHost = document.querySelector('[data-area="source"]');
  const graphHost = document.querySelector('[data-area="graph"]');
  if (sourceHost) sourceHost.innerHTML = renderFocusedSource(source);
  if (graphHost) graphHost.outerHTML = renderGraphArea(projectOneHopGraph(source.symbol, []));
  resetSourceRelations();
  afterRender();
}
function createFocusActions(storage) {
  let currentSymbol;
  let focus;
  let latestNavigation = {};
  const showFocus = (reply) => renderFocus(
    reply,
    (symbolId) => currentSymbol = symbolId,
    () => bindSourceRelations(storage, focus)
  );
  const navigate = async (request) => {
    const navigation = {};
    latestNavigation = navigation;
    try {
      const reply = await request();
      if (latestNavigation !== navigation) return;
      showFocus(reply);
      showActionStatus(reply.state ?? "ready");
    } catch (error) {
      if (latestNavigation !== navigation) return;
      showActionError(error);
    }
  };
  focus = (symbolId) => navigate(() => browserRequest(storage, "api/focus", { request_id: crypto.randomUUID(), symbol_id: symbolId }));
  document.querySelector('[data-operation="refocus"]')?.addEventListener("click", () => {
    if (currentSymbol) void focus(currentSymbol);
  });
  return { focus, navigate };
}

// src/browser/application.ts
function bindSymbols(focus) {
  for (const button of document.querySelectorAll("[data-symbol-id]")) {
    button.addEventListener("click", () => {
      const symbolId = button.dataset.symbolId;
      if (symbolId) void focus(symbolId);
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
function startApplication(storage, startedState, root2) {
  const store = createBrowserStore({ status: startedState, landmarks: [] });
  root2.innerHTML = renderBrowserBody(store.state(), window.innerWidth);
  const { focus, navigate } = createFocusActions(storage);
  let discovery = createDiscovery(storage, []);
  bindSymbols(focus);
  bindSearch(
    () => discovery,
    () => renderDiscoveryArea(discovery, focus)
  );
  loadLandmarks(storage, (landmarks) => {
    if (discovery.state().query) return;
    discovery = createDiscovery(storage, landmarks);
    renderDiscoveryArea(discovery, focus);
  });
  bindHistory(storage, navigate);
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
    const visibleState = started.data?.root_access === "root_access_denied" ? "root_access_denied" : started.state;
    root.textContent = `Code Explorer: ${visibleState}`;
    root.setAttribute("data-state", visibleState === "root_access_denied" ? "unavailable" : "ready");
    void browserRequest(storage, "api/status", { action: "status" }).catch(() => void 0);
    startApplication(storage, visibleState, root);
  }).catch(() => {
    root.textContent = "Code Explorer: workspace_unavailable";
    root.setAttribute("data-state", "unavailable");
  });
}
