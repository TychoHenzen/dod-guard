import { showActionError, showActionStatus } from "./application-events.js";
import { type BrowserReply, focusedSource } from "./browser-reply.js";
import { browserRequest } from "./browser-request.js";
import { projectOneHopGraph } from "./graph.js";
import { renderGraphArea } from "./graph-navigation.js";
import type { BrowserStorage } from "./session.js";
import { renderFocusedSource } from "./source.js";
import { bindSourceRelations, type FocusAction, resetSourceRelations } from "./source-relations.js";

type FocusNavigationAction = (request: () => Promise<BrowserReply>) => Promise<void>;

function renderFocus(reply: BrowserReply, setCurrent: (symbolId: string) => void, afterRender: () => void): void {
  const source = focusedSource(reply);
  if (!source) throw new Error("invalid_browser_view");
  setCurrent(source.symbol.symbol_id);
  const sourceHost = document.querySelector<HTMLElement>('[data-area="source"]');
  const graphHost = document.querySelector<HTMLElement>('[data-area="graph"]');
  if (sourceHost) sourceHost.innerHTML = renderFocusedSource(source);
  if (graphHost) graphHost.outerHTML = renderGraphArea(projectOneHopGraph(source.symbol, []));
  resetSourceRelations();
  afterRender();
}

export function createFocusActions(storage: BrowserStorage): {
  focus: FocusAction;
  navigate: FocusNavigationAction;
} {
  let currentSymbol: string | undefined;
  let focus: FocusAction;
  let latestNavigation = {};
  const showFocus = (reply: BrowserReply) =>
    renderFocus(
      reply,
      (symbolId) => (currentSymbol = symbolId),
      () => bindSourceRelations(storage, focus),
    );
  const navigate: FocusNavigationAction = async (request) => {
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
  focus = (symbolId) =>
    navigate(() => browserRequest(storage, "api/focus", { request_id: crypto.randomUUID(), symbol_id: symbolId }));
  document.querySelector<HTMLElement>('[data-operation="refocus"]')?.addEventListener("click", () => {
    if (currentSymbol) void focus(currentSymbol);
  });
  return { focus, navigate };
}
