import { createBrowserStore, renderBrowserBody } from "./app.js";
import { BrowserDiscoveryController, type DiscoveryReply, renderDiscovery } from "./discovery.js";
import { projectOneHopGraph } from "./graph.js";
import { renderGraphArea } from "./graph-navigation.js";
import { BrowserSessionClient, type BrowserSessionReply, type BrowserStorage } from "./session.js";
import { type FocusedSource, renderFocusedSource } from "./source.js";

type BrowserReply = { state?: string; code?: string; project_generation?: number; data?: Record<string, unknown> };

function ownership(storage: BrowserStorage): Record<string, string> | undefined {
  const session = storage.get("browser_session_id");
  const tab = storage.get("tab_instance_id");
  return session && tab ? { "x-code-explorer-session": session, "x-code-explorer-tab": tab } : undefined;
}

async function browserRequest(storage: BrowserStorage, path: string, body: Record<string, unknown>) {
  const headers = ownership(storage);
  if (!headers) throw new Error("invalid_browser_session");
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as BrowserReply;
  if (!response.ok) throw new Error(payload.code ?? "workspace_unavailable");
  return payload;
}

function landmarkGroups(reply: BrowserReply): Array<{
  group: string;
  items: Array<{ symbol_id: string; name: string; path: string; kind: string }>;
}> {
  const groups = Array.isArray(reply.data?.landmarks) ? reply.data.landmarks : [];
  return groups.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const group = value as { group?: unknown; symbols?: unknown };
    if (typeof group.group !== "string" || !Array.isArray(group.symbols)) return [];
    const items = group.symbols.flatMap((symbol) => {
      if (!symbol || typeof symbol !== "object") return [];
      const item = symbol as Record<string, unknown>;
      return typeof item.symbol_id === "string" &&
        typeof item.name === "string" &&
        typeof item.path === "string" &&
        typeof item.kind === "string"
        ? [{ symbol_id: item.symbol_id, name: item.name, path: item.path, kind: item.kind }]
        : [];
    });
    return [{ group: group.group, items }];
  });
}

function focusedSource(reply: BrowserReply): FocusedSource | undefined {
  const data = reply.data;
  const content = data?.content as Record<string, unknown> | undefined;
  const body = content?.body ?? content?.declaration;
  if (
    typeof data?.view_id !== "string" ||
    typeof data.symbol_id !== "string" ||
    typeof data.name !== "string" ||
    typeof data.kind !== "string" ||
    typeof data.path !== "string" ||
    typeof body !== "string"
  )
    return undefined;
  return {
    view_id: data.view_id,
    symbol: { name: data.name, kind: data.kind, path: data.path, symbol_id: data.symbol_id },
    generation:
      typeof data.project_generation === "number"
        ? data.project_generation
        : typeof reply.project_generation === "number"
          ? reply.project_generation
          : 0,
    body,
    handles: [],
    returned_bytes: typeof content?.returned_bytes === "number" ? content.returned_bytes : 0,
    total_bytes: typeof content?.total_bytes === "number" ? content.total_bytes : 0,
    limit_bytes: typeof content?.limit_bytes === "number" ? content.limit_bytes : 0,
    truncated: content?.truncated === true,
  };
}

function startApplication(storage: BrowserStorage, startedState: string, root: HTMLDivElement): void {
  const landmarks: ReturnType<typeof landmarkGroups> = [];
  const store = createBrowserStore({
    status: startedState,
    landmarks,
  });
  root.innerHTML = renderBrowserBody(store.state(), window.innerWidth);
  let discovery = new BrowserDiscoveryController(
    (request) =>
      browserRequest(storage, "/api/search", {
        request_id: crypto.randomUUID(),
        ...request,
      }) as Promise<DiscoveryReply>,
    landmarks,
  );
  let currentSymbol: string | undefined;

  const renderFocus = (reply: BrowserReply) => {
    const source = focusedSource(reply);
    if (!source) throw new Error("invalid_browser_view");
    currentSymbol = source.symbol.symbol_id;
    const sourceHost = document.querySelector<HTMLElement>('[data-area="source"]');
    const graphHost = document.querySelector<HTMLElement>('[data-area="graph"]');
    if (sourceHost) sourceHost.innerHTML = renderFocusedSource(source);
    if (graphHost) graphHost.outerHTML = renderGraphArea(projectOneHopGraph(source.symbol, []));
  };
  const focus = async (symbolId: string) =>
    renderFocus(await browserRequest(storage, "/api/focus", { request_id: crypto.randomUUID(), symbol_id: symbolId }));
  const bindSymbols = () => {
    for (const button of document.querySelectorAll<HTMLElement>("[data-symbol-id]")) {
      button.addEventListener("click", () => {
        const symbolId = button.dataset.symbolId;
        if (symbolId) void focus(symbolId);
      });
    }
  };
  const bindSearch = () => {
    document.querySelector<HTMLInputElement>('[data-operation="search"]')?.addEventListener("change", async (event) => {
      const query = (event.target as HTMLInputElement).value;
      if (discovery.state().query === query.trim()) return;
      await discovery.search(query);
      renderDiscoveryArea();
    });
  };
  const renderDiscoveryArea = () => {
    const host = document.querySelector<HTMLElement>('[data-area="discovery"]');
    if (host) host.innerHTML = renderDiscovery(discovery.state());
    bindSymbols();
    bindSearch();
  };

  bindSymbols();
  bindSearch();
  void Promise.resolve()
    .then(() => browserRequest(storage, "/api/search", { request_id: crypto.randomUUID(), query: "" }))
    .then((reply) => {
      const loaded = landmarkGroups(reply);
      discovery = new BrowserDiscoveryController(
        (request) =>
          browserRequest(storage, "/api/search", {
            request_id: crypto.randomUUID(),
            ...request,
          }) as Promise<DiscoveryReply>,
        loaded,
      );
      renderDiscoveryArea();
    })
    .catch(() => undefined);
  for (const operation of ["back", "forward"] as const) {
    document.querySelector<HTMLElement>(`[data-operation="${operation}"]`)?.addEventListener("click", async () => {
      renderFocus(
        await browserRequest(storage, "/api/history", { request_id: crypto.randomUUID(), action: operation }),
      );
    });
  }
  document.querySelector<HTMLElement>('[data-operation="refocus"]')?.addEventListener("click", () => {
    if (currentSymbol) void focus(currentSymbol);
  });
  document.querySelector<HTMLElement>('[data-operation="refresh"]')?.addEventListener("click", async () => {
    const reply = await browserRequest(storage, "/api/status", { action: "refresh", request_id: crypto.randomUUID() });
    const status = document.querySelector<HTMLElement>('[data-area="status"]');
    if (status) status.textContent = reply.state ?? "ready";
  });
}

const root = document.querySelector<HTMLDivElement>("#code-explorer");
if (root) {
  root.textContent = "Loading Code Explorer";
  root.setAttribute("data-state", "loading");
  const storage: BrowserStorage = {
    get: (key) => sessionStorage.getItem(key),
    set: (key, value) => sessionStorage.setItem(key, value),
    clear: () => {
      sessionStorage.removeItem("browser_session_id");
      sessionStorage.removeItem("tab_instance_id");
    },
  };
  const session = new BrowserSessionClient({
    storage,
    navigationType: () =>
      (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type,
    lock: async (name, action) =>
      await navigator.locks.request(name, { ifAvailable: true }, (lock) => action(lock !== null)),
    randomId: () => crypto.randomUUID(),
    request: async (body, headers) => {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as BrowserSessionReply & { code?: string };
      return response.ok ? payload : { ...payload, state: payload.code ?? "workspace_unavailable" };
    },
  });
  void session
    .start()
    .then((started) => {
      if (!ownership(storage)) throw new Error(started.state);
      root.textContent = `Code Explorer: ${started.state}`;
      root.setAttribute("data-state", "ready");
      void browserRequest(storage, "/api/status", { action: "status" }).catch(() => undefined);
      startApplication(storage, started.state, root);
    })
    .catch(() => {
      root.textContent = "Code Explorer: workspace_unavailable";
      root.setAttribute("data-state", "unavailable");
    });
}
