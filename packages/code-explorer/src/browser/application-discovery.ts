import { landmarkGroups } from "./browser-reply.js";
import { browserRequest } from "./browser-request.js";
import { BrowserDiscoveryController, type DiscoveryReply, renderDiscovery } from "./discovery.js";
import type { BrowserStorage } from "./session.js";

export type LandmarkGroups = ReturnType<typeof landmarkGroups>;

export function bindSymbols(focus: (symbolId: string) => void): void {
  for (const button of document.querySelectorAll<HTMLElement>("[data-symbol-id]")) {
    button.addEventListener("click", () => {
      const symbolId = button.dataset.symbolId;
      if (symbolId) focus(symbolId);
    });
  }
}

export function bindSearch(discovery: () => BrowserDiscoveryController, render: () => void): void {
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

export function renderDiscoveryArea(discovery: BrowserDiscoveryController, focus: (symbolId: string) => void): void {
  const host = document.querySelector<HTMLElement>('[data-area="discovery"]');
  if (host) host.innerHTML = renderDiscovery(discovery.state());
  bindSymbols(focus);
}

export function createDiscovery(storage: BrowserStorage, landmarks: LandmarkGroups): BrowserDiscoveryController {
  return new BrowserDiscoveryController(
    (request) =>
      browserRequest(storage, "api/search", {
        request_id: crypto.randomUUID(),
        ...request,
      }) as Promise<DiscoveryReply>,
    landmarks,
  );
}

export function loadLandmarks(storage: BrowserStorage, apply: (groups: LandmarkGroups) => void): void {
  void browserRequest(storage, "api/search", { request_id: crypto.randomUUID(), query: "" })
    .then((reply) => apply(landmarkGroups(reply)))
    .catch(() => undefined);
}
