import { createBrowserStore, renderBrowserBody } from "./app.js";
import {
  bindSearch,
  bindSymbols,
  createDiscovery,
  loadLandmarks,
  renderDiscoveryArea,
} from "./application-discovery.js";
import { bindHistory, bindRefresh, showActionStatus } from "./application-events.js";
import { ApplicationFocusController } from "./application-focus.js";
import { type BrowserReply, focusedSource } from "./browser-reply.js";
import { browserRequest } from "./browser-request.js";
import { BrowserFocusNavigation, type FocusReply } from "./focus-navigation.js";
import { BrowserRelationView } from "./relations.js";
import type { BrowserStorage } from "./session.js";

function focusReply(reply: BrowserReply): FocusReply {
  const source = focusedSource(reply);
  const data = source && {
    view_id: source.view_id,
    symbol_id: source.symbol.symbol_id,
    name: source.symbol.name,
    source,
  };
  return data ? { state: "ok", data } : { state: "invalid_browser_view" };
}

function createNavigation(storage: BrowserStorage): BrowserFocusNavigation {
  return new BrowserFocusNavigation(undefined, async ({ symbol_id }) =>
    focusReply(
      await browserRequest(storage, "api/focus", {
        request_id: crypto.randomUUID(),
        symbol_id,
      }),
    ),
  );
}

function bindRefocus(navigation: BrowserFocusNavigation, focusSymbol: (symbolId: string) => Promise<void>): void {
  document.querySelector<HTMLElement>('[data-operation="refocus"]')?.addEventListener("click", () => {
    const symbolId = navigation.state().focus?.symbol_id;
    if (symbolId) void focusSymbol(symbolId);
  });
}

function bindDiscovery(storage: BrowserStorage, focusSymbol: (symbolId: string) => Promise<void>): void {
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
}

function bindHistoryNavigation(navigation: BrowserFocusNavigation, relationView: BrowserRelationView): void {
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

export function startApplication(storage: BrowserStorage, startedState: string, root: HTMLDivElement): void {
  const store = createBrowserStore({ status: startedState, landmarks: [] });
  root.innerHTML = renderBrowserBody(store.state(), window.innerWidth);
  const navigation = createNavigation(storage);
  const relationView = new BrowserRelationView(storage, navigation);
  const focusController = new ApplicationFocusController(navigation, relationView);
  const focusSymbol = focusController.focusSymbol.bind(focusController);
  bindRefocus(navigation, focusSymbol);
  bindDiscovery(storage, focusSymbol);
  bindHistoryNavigation(navigation, relationView);
  bindRefresh(storage);
}
