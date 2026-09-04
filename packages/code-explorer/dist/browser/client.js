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

// src/browser/discovery.ts
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
    if (filters.path_globs) request.path_globs = [...filters.path_globs];
    if (filters.languages) request.languages = [...filters.languages];
    if (filters.kinds) request.kinds = [...filters.kinds];
    if (filters.content) request.content = filters.content;
    if (filters.include_generated !== void 0) request.include_generated = filters.include_generated;
    this.current = { ...this.current, query: normalized, filters, areaState: "loading", error: void 0 };
    try {
      const reply = await this.searchCore(request);
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

// src/browser/client.ts
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
function landmarkGroups(reply) {
  const groups = Array.isArray(reply.data?.landmarks) ? reply.data.landmarks : [];
  return groups.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const group = value;
    if (typeof group.group !== "string" || !Array.isArray(group.symbols)) return [];
    const items = group.symbols.flatMap((symbol) => {
      if (!symbol || typeof symbol !== "object") return [];
      const item = symbol;
      return typeof item.symbol_id === "string" && typeof item.name === "string" && typeof item.path === "string" && typeof item.kind === "string" ? [{ symbol_id: item.symbol_id, name: item.name, path: item.path, kind: item.kind }] : [];
    });
    return [{ group: group.group, items }];
  });
}
function focusedSource(reply) {
  const data = reply.data;
  const content = data?.content;
  const body = content?.body ?? content?.declaration;
  if (typeof data?.view_id !== "string" || typeof data.symbol_id !== "string" || typeof data.name !== "string" || typeof data.kind !== "string" || typeof data.path !== "string" || typeof body !== "string")
    return void 0;
  return {
    view_id: data.view_id,
    symbol: { name: data.name, kind: data.kind, path: data.path, symbol_id: data.symbol_id },
    generation: typeof data.project_generation === "number" ? data.project_generation : typeof reply.project_generation === "number" ? reply.project_generation : 0,
    body,
    handles: [],
    returned_bytes: typeof content?.returned_bytes === "number" ? content.returned_bytes : 0,
    total_bytes: typeof content?.total_bytes === "number" ? content.total_bytes : 0,
    limit_bytes: typeof content?.limit_bytes === "number" ? content.limit_bytes : 0,
    truncated: content?.truncated === true
  };
}
function startApplication(storage, startedState, root2) {
  const landmarks = [];
  const store = createBrowserStore({
    status: startedState,
    landmarks
  });
  root2.innerHTML = renderBrowserBody(store.state(), window.innerWidth);
  let discovery = new BrowserDiscoveryController(
    (request) => browserRequest(storage, "/api/search", {
      request_id: crypto.randomUUID(),
      ...request
    }),
    landmarks
  );
  let currentSymbol;
  const renderFocus = (reply) => {
    const source = focusedSource(reply);
    if (!source) throw new Error("invalid_browser_view");
    currentSymbol = source.symbol.symbol_id;
    const sourceHost = document.querySelector('[data-area="source"]');
    const graphHost = document.querySelector('[data-area="graph"]');
    if (sourceHost) sourceHost.innerHTML = renderFocusedSource(source);
    if (graphHost) graphHost.outerHTML = renderGraphArea(projectOneHopGraph(source.symbol, []));
  };
  const focus = async (symbolId) => renderFocus(await browserRequest(storage, "/api/focus", { request_id: crypto.randomUUID(), symbol_id: symbolId }));
  const bindSymbols = () => {
    for (const button of document.querySelectorAll("[data-symbol-id]")) {
      button.addEventListener("click", () => {
        const symbolId = button.dataset.symbolId;
        if (symbolId) void focus(symbolId);
      });
    }
  };
  const bindSearch = () => {
    document.querySelector('[data-operation="search"]')?.addEventListener("change", async (event) => {
      const query = event.target.value;
      if (discovery.state().query === query.trim()) return;
      await discovery.search(query);
      renderDiscoveryArea();
    });
  };
  const renderDiscoveryArea = () => {
    const host = document.querySelector('[data-area="discovery"]');
    if (host) host.innerHTML = renderDiscovery(discovery.state());
    bindSymbols();
    bindSearch();
  };
  bindSymbols();
  bindSearch();
  void Promise.resolve().then(() => browserRequest(storage, "/api/search", { request_id: crypto.randomUUID(), query: "" })).then((reply) => {
    const loaded = landmarkGroups(reply);
    discovery = new BrowserDiscoveryController(
      (request) => browserRequest(storage, "/api/search", {
        request_id: crypto.randomUUID(),
        ...request
      }),
      loaded
    );
    renderDiscoveryArea();
  }).catch(() => void 0);
  for (const operation of ["back", "forward"]) {
    document.querySelector(`[data-operation="${operation}"]`)?.addEventListener("click", async () => {
      renderFocus(
        await browserRequest(storage, "/api/history", { request_id: crypto.randomUUID(), action: operation })
      );
    });
  }
  document.querySelector('[data-operation="refocus"]')?.addEventListener("click", () => {
    if (currentSymbol) void focus(currentSymbol);
  });
  document.querySelector('[data-operation="refresh"]')?.addEventListener("click", async () => {
    const reply = await browserRequest(storage, "/api/status", { action: "refresh", request_id: crypto.randomUUID() });
    const status = document.querySelector('[data-area="status"]');
    if (status) status.textContent = reply.state ?? "ready";
  });
}
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
      const response = await fetch("/api/session", {
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
    root.textContent = `Code Explorer: ${started.state}`;
    root.setAttribute("data-state", "ready");
    void browserRequest(storage, "/api/status", { action: "status" }).catch(() => void 0);
    startApplication(storage, started.state, root);
  }).catch(() => {
    root.textContent = "Code Explorer: workspace_unavailable";
    root.setAttribute("data-state", "unavailable");
  });
}
