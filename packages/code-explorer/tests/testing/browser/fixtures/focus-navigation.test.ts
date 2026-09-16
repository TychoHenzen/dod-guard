import type { BrowserFocus } from "../../../../src/browser/browser-focus.js";
import { BrowserFocusNavigation } from "../../../../src/browser/focus-navigation.js";

export function navigationFixture(focus: BrowserFocus) {
  const calls: Record<string, unknown>[] = [];
  const navigation = new BrowserFocusNavigation(
    { view_id: "view-old", symbol_id: "old", name: "Old" },
    async (request) => {
      calls.push(request);
      return { state: "ok", data: focus };
    },
  );
  return { calls, navigation };
}
