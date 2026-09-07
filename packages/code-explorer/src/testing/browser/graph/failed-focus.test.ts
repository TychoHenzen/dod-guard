import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserFocusNavigation } from "../../../browser/focus-navigation.js";
import { projectOneHopGraph } from "../../../browser/graph.js";
import { BrowserGraphController } from "../../../browser/graph-navigation.js";

import { focus, loaded } from "./fixture.test.js";

describe("graph navigation and view ownership", () => {
  it(
    "keeps the prior graph and " + "history when graph focus fails",
    async () => {
      const navigation = new BrowserFocusNavigation(
        { view_id: "view-old", symbol_id: "old", name: "Old" },
        async () => ({
          state: "stale_view",
        }),
      );
      const controller = new BrowserGraphController(navigation, () => false);
      const graph = projectOneHopGraph(focus, [
        loaded("callers", [{ symbol_id: "project::Caller", name: "Caller" }]),
      ]);

      assert.equal(await controller.select(graph.nodes[1]), false);
      assert.deepEqual(
        navigation.state().history.map((entry) => entry.view_id),
        ["view-old"],
      );
      assert.deepEqual(
        graph.nodes.map((node) => node.symbol_id),
        ["project::Focus", "project::Caller"],
      );
    },
  );
});
