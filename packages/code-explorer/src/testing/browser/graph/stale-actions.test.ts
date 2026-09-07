import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserFocusNavigation } from "../../../browser/focus-navigation.js";
import { projectOneHopGraph } from "../../../browser/graph.js";
import {
  BrowserGraphController,
  renderGraphArea,
} from "../../../browser/graph-navigation.js";

import { focus, loaded } from "./fixture.test.js";

describe("graph navigation and view ownership", () => {
  it(
    "keeps stale graph data visible " + "while disabling its node actions",
    async () => {
      const navigation = new BrowserFocusNavigation(
        { view_id: "view-old", symbol_id: "old", name: "Old" },
        async () => ({
          state: "ok",
          data: {
            view_id: "unexpected",
            symbol_id: "unexpected",
            name: "Unexpected",
          },
        }),
      );
      const controller = new BrowserGraphController(navigation, () => true);
      const graph = projectOneHopGraph(focus, [
        loaded("callers", [{ symbol_id: "project::Caller", name: "Caller" }]),
      ]);

      assert.match(
        renderGraphArea(graph, { stale: true }),
        /data-state="stale"/,
      );
      assert.equal(await controller.select(graph.nodes[1]), false);
      assert.equal(navigation.state().history.length, 1);
    },
  );
});
