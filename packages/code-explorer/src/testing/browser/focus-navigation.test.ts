import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserFocusNavigation } from "../../browser/focus-navigation.js";
import { navigationFixture } from "./fixtures/focus-navigation.test.js";

type Focus = { view_id: string; symbol_id: string; name: string };

describe("browser focus navigation", () => {
  it(
    "recenters a search candidate through the " +
      "shared focus action and appends one view",
    async () => {
      const { calls, navigation } = navigationFixture({
        view_id: "view-new",
        symbol_id: "new",
        name: "New",
      });
      const result = await navigation.selectSearch({ symbol_id: "new" });
      assert.equal(result, true);
      assert.deepEqual(calls, [{ symbol_id: "new" }]);
      assert.equal(navigation.state().focus?.view_id, "view-new");
      assert.deepEqual(
        navigation.state().history.map((view) => view.view_id),
        ["view-old", "view-new"],
      );
    },
  );
  it(
    "routes a visible handle result through the same " +
      "focus action while retaining the previous view",
    async () => {
      const { calls, navigation } = navigationFixture({
        view_id: "view-handle",
        symbol_id: "target",
        name: "Target",
      });
      await navigation.selectHandle({ symbol_id: "target" });
      assert.deepEqual(calls, [{ symbol_id: "target" }]);
      assert.equal(navigation.state().history[0]?.view_id, "view-old");
      assert.equal(navigation.state().focus?.view_id, "view-handle");
    },
  );
  it(
    "preserves the current view " + "and history when focus fails",
    async () => {
      const initial: Focus = {
        view_id: "view-old",
        symbol_id: "old",
        name: "Old",
      };
      const navigation = new BrowserFocusNavigation(initial, async () => ({
        state: "backend_unavailable",
      }));
      const result = await navigation.selectRelation({ symbol_id: "gone" });
      assert.equal(result, false);
      assert.deepEqual(navigation.state().focus, initial);
      assert.deepEqual(navigation.state().history, [initial]);
      assert.equal(navigation.state().error, "backend_unavailable");
    },
  );
});
