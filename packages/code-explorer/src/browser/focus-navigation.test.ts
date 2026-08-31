import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserFocusNavigation } from "./focus-navigation.js";

type Focus = { view_id: string; symbol_id: string; name: string };

describe("browser focus navigation", () => {
  // covers: code-explorer/browser-navigation :: Selecting a local result recenters navigation :: User selects a search candidate
  it("recenters a search candidate through the shared focus action and appends one view", async () => {
    const calls: Record<string, unknown>[] = [];
    const navigation = new BrowserFocusNavigation(
      { view_id: "view-old", symbol_id: "old", name: "Old" },
      async (request) => {
        calls.push(request);
        return { state: "ok", data: { view_id: "view-new", symbol_id: "new", name: "New" } };
      },
    );
    const result = await navigation.selectSearch({ symbol_id: "new" });
    assert.equal(result, true);
    assert.deepEqual(calls, [{ symbol_id: "new" }]);
    assert.equal(navigation.state().focus.view_id, "view-new");
    assert.deepEqual(
      navigation.state().history.map((view) => view.view_id),
      ["view-old", "view-new"],
    );
  });

  // covers: code-explorer/browser-navigation :: Selecting a local result recenters navigation :: User follows a visible handle
  it("routes a visible handle result through the same focus action while retaining the previous view", async () => {
    const calls: Record<string, unknown>[] = [];
    const navigation = new BrowserFocusNavigation(
      { view_id: "view-old", symbol_id: "old", name: "Old" },
      async (request) => {
        calls.push(request);
        return { state: "ok", data: { view_id: "view-handle", symbol_id: "target", name: "Target" } };
      },
    );
    await navigation.selectHandle({ symbol_id: "target" });
    assert.deepEqual(calls, [{ symbol_id: "target" }]);
    assert.equal(navigation.state().history[0]?.view_id, "view-old");
    assert.equal(navigation.state().focus.view_id, "view-handle");
  });

  // covers: code-explorer/browser-navigation :: Selecting a local result recenters navigation :: Focus request fails
  it("preserves the current view and history when focus fails", async () => {
    const initial: Focus = { view_id: "view-old", symbol_id: "old", name: "Old" };
    const navigation = new BrowserFocusNavigation(initial, async () => ({ state: "backend_unavailable" }));
    const result = await navigation.selectRelation({ symbol_id: "gone" });
    assert.equal(result, false);
    assert.deepEqual(navigation.state().focus, initial);
    assert.deepEqual(navigation.state().history, [initial]);
    assert.equal(navigation.state().error, "backend_unavailable");
  });
});
