import { createBrowserStore, renderBrowserBody } from "./app.js";
import {
  bindSearch,
  bindSymbols,
  createDiscovery,
  loadLandmarks,
  renderDiscoveryArea,
} from "./application-discovery.js";
import {
  bindHistory,
  bindRefresh,
  showActionStatus,
} from "./application-events.js";
import { ApplicationFocusController } from "./application-focus.js";
import { createNavigation } from "./application-navigation.js";
import { BrowserFocusNavigation } from "./focus-navigation.js";
import { BrowserRelationView } from "./relation-view.js";
import type { BrowserStorage } from "./session.js";

function bindRefocus(
  navigation: BrowserFocusNavigation,
  focusSymbol: (symbolId: string) => Promise<void>,
): void {
  document
    .querySelector<HTMLElement>('[data-operation="refocus"]')
    ?.addEventListener("click", () => {
      const symbolId = navigation.state().focus?.symbol_id;
      if (symbolId) void focusSymbol(symbolId);
    });
}

function bindDiscovery(
  storage: BrowserStorage,
  focusSymbol: (symbolId: string) => Promise<void>,
): void {
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

function bindHistoryNavigation(
  navigation: BrowserFocusNavigation,
  relationView: BrowserRelationView,
): void {
  bindHistory((action) => handleHistory(action, navigation, relationView));
}

async function handleHistory(
  action: "back" | "forward",
  navigation: BrowserFocusNavigation,
  relationView: BrowserRelationView,
): Promise<void> {
  const moved = action === "back" ? navigation.back() : navigation.forward();
  if (moved) {
    relationView.renderFocusedView();
    showActionStatus("ready");
    return;
  }
  showActionStatus("history_empty");
}

export function startApplication(
  storage: BrowserStorage,
  startedState: string,
  root: HTMLDivElement,
): void {
  const store = createBrowserStore({ status: startedState, landmarks: [] });
  root.innerHTML = renderBrowserBody(store.state(), window.innerWidth);
  const navigation = createNavigation(storage);
  const relationView = new BrowserRelationView(storage, navigation);
  const focusController = new ApplicationFocusController(
    navigation,
    relationView,
  );
  const focusSymbol = focusController.focusSymbol.bind(focusController);
  bindRefocus(navigation, focusSymbol);
  bindDiscovery(storage, focusSymbol);
  bindHistoryNavigation(navigation, relationView);
  bindRefresh(storage);
}
