import { createBrowserStore, renderBrowserBody } from "./app.js";
import { bindHistory, bindRefresh } from "./application-events.js";
import { landmarkGroups } from "./browser-reply.js";
import { browserRequest } from "./browser-request.js";
import { BrowserDiscoveryController, type DiscoveryReply, renderDiscovery } from "./discovery.js";
import { createFocusActions } from "./focus-actions.js";
import type { BrowserStorage } from "./session.js";
import type { FocusAction } from "./source-relations.js";

function bindSymbols(focus: FocusAction): void {
  for (const button of document.querySelectorAll<HTMLElement>("[data-symbol-id]")) {
    button.addEventListener("click", () => {
      const symbolId = button.dataset.symbolId;
      if (symbolId) void focus(symbolId);
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

function renderDiscoveryArea(discovery: BrowserDiscoveryController, focus: FocusAction): void {
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
  const { focus, navigate } = createFocusActions(storage);
  let discovery = createDiscovery(storage, []);
  bindSymbols(focus);
  bindSearch(
    () => discovery,
    () => renderDiscoveryArea(discovery, focus),
  );
  loadLandmarks(storage, (landmarks) => {
    if (discovery.state().query) return;
    discovery = createDiscovery(storage, landmarks);
    renderDiscoveryArea(discovery, focus);
  });
  bindHistory(storage, navigate);
  bindRefresh(storage);
}
