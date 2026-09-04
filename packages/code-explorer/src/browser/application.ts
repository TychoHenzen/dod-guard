import { createBrowserStore, renderBrowserBody } from "./app.js";
import { focusedSource, landmarkGroups, type BrowserReply } from "./browser-reply.js";
import { browserRequest } from "./browser-request.js";
import { BrowserDiscoveryController, type DiscoveryReply, renderDiscovery } from "./discovery.js";
import { projectOneHopGraph } from "./graph.js";
import { renderGraphArea } from "./graph-navigation.js";
import type { BrowserStorage } from "./session.js";
import { renderFocusedSource } from "./source.js";

type FocusAction = (symbolId: string) => Promise<void>;

function renderFocus(reply: BrowserReply, setCurrent: (symbolId: string) => void): void {
  const source = focusedSource(reply);
  if (!source) throw new Error("invalid_browser_view");
  setCurrent(source.symbol.symbol_id);
  const sourceHost = document.querySelector<HTMLElement>('[data-area="source"]');
  const graphHost = document.querySelector<HTMLElement>('[data-area="graph"]');
  if (sourceHost) sourceHost.innerHTML = renderFocusedSource(source);
  if (graphHost) graphHost.outerHTML = renderGraphArea(projectOneHopGraph(source.symbol, []));
}

function bindSymbols(focus: FocusAction): void {
  for (const button of document.querySelectorAll<HTMLElement>("[data-symbol-id]")) {
    button.addEventListener("click", () => {
      const symbolId = button.dataset.symbolId;
      if (symbolId) void focus(symbolId);
    });
  }
}

function bindSearch(discovery: () => BrowserDiscoveryController, render: () => void): void {
  document.querySelector<HTMLInputElement>('[data-operation="search"]')?.addEventListener("change", async (event) => {
    const query = (event.target as HTMLInputElement).value;
    if (discovery().state().query === query.trim()) return;
    await discovery().search(query);
    render();
  });
}

function renderDiscoveryArea(discovery: BrowserDiscoveryController, focus: FocusAction): void {
  const host = document.querySelector<HTMLElement>('[data-area="discovery"]');
  if (host) host.innerHTML = renderDiscovery(discovery.state());
  bindSymbols(focus);
}

function createDiscovery(storage: BrowserStorage, landmarks: ReturnType<typeof landmarkGroups>) {
  return new BrowserDiscoveryController(
    (request) =>
      browserRequest(storage, "/api/search", {
        request_id: crypto.randomUUID(),
        ...request,
      }) as Promise<DiscoveryReply>,
    landmarks,
  );
}

function bindHistory(storage: BrowserStorage, render: (reply: BrowserReply) => void): void {
  for (const operation of ["back", "forward"] as const) {
    document.querySelector<HTMLElement>(`[data-operation="${operation}"]`)?.addEventListener("click", async () => {
      render(await browserRequest(storage, "/api/history", { request_id: crypto.randomUUID(), action: operation }));
    });
  }
}

function bindRefresh(storage: BrowserStorage): void {
  document.querySelector<HTMLElement>('[data-operation="refresh"]')?.addEventListener("click", async () => {
    const reply = await browserRequest(storage, "/api/status", {
      action: "refresh",
      request_id: crypto.randomUUID(),
    });
    const status = document.querySelector<HTMLElement>('[data-area="status"]');
    if (status) status.textContent = reply.state ?? "ready";
  });
}

export function startApplication(storage: BrowserStorage, startedState: string, root: HTMLDivElement): void {
  const store = createBrowserStore({ status: startedState, landmarks: [] });
  root.innerHTML = renderBrowserBody(store.state(), window.innerWidth);
  let currentSymbol: string | undefined;
  const showFocus = (reply: BrowserReply) => renderFocus(reply, (symbolId) => (currentSymbol = symbolId));
  const focus: FocusAction = async (symbolId) =>
    showFocus(await browserRequest(storage, "/api/focus", { request_id: crypto.randomUUID(), symbol_id: symbolId }));
  let discovery = createDiscovery(storage, []);
  bindSymbols(focus);
  bindSearch(
    () => discovery,
    () => renderDiscoveryArea(discovery, focus),
  );
  void browserRequest(storage, "/api/search", { request_id: crypto.randomUUID(), query: "" })
    .then((reply) => {
      discovery = createDiscovery(storage, landmarkGroups(reply));
      renderDiscoveryArea(discovery, focus);
    })
    .catch(() => undefined);
  bindHistory(storage, showFocus);
  document.querySelector<HTMLElement>('[data-operation="refocus"]')?.addEventListener("click", () => {
    if (currentSymbol) void focus(currentSymbol);
  });
  bindRefresh(storage);
}
