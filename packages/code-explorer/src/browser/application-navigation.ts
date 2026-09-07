import { type BrowserReply, focusedSource } from "./browser-reply.js";
import { browserRequest } from "./browser-request.js";
import { BrowserFocusNavigation, type FocusReply } from "./focus-navigation.js";
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

export function createNavigation(
  storage: BrowserStorage,
): BrowserFocusNavigation {
  return new BrowserFocusNavigation(undefined, (target) =>
    focusNavigation(storage, target.symbol_id),
  );
}

async function focusNavigation(
  storage: BrowserStorage,
  symbol_id: string,
): Promise<FocusReply> {
  const reply = await browserRequest(storage, "api/focus", {
    request_id: crypto.randomUUID(),
    symbol_id,
  });
  return focusReply(reply);
}
