import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserFocusNavigation } from "../../../browser/focus-navigation.js";
import {
  projectOneHopGraph,
  renderOneHopGraph,
} from "../../../browser/graph.js";
import {
  BrowserGraphController,
  graphFor,
  toGraphRelationGroups,
} from "../../../browser/graph-navigation.js";

import { browserGroup, focus } from "./fixture.test.js";

describe("graph navigation and view ownership", () => {
  it(
    "routes a local graph node through focus " +
      "navigation and resets the graph after success",
    async () => {
      const navigation = successfulNavigation();
      const controller = new BrowserGraphController(navigation, () => false);
      const graph = projectOneHopGraph(
        focus,
        toGraphRelationGroups([
          browserGroup("callers", [
            {
              name: "Caller",
              external: false,
              symbol_id: "project::Caller",
              local_handle: "h",
            },
          ]),
        ]),
      );

      assert.equal(await controller.select(graph.nodes[1]), true);
      assert.deepEqual(
        navigation.state().history.map((entry) => entry.view_id),
        ["view-old", "view-new"],
      );
      assert.match(renderOneHopGraph(graph), /data-focus="project::Caller"/);
      assert.deepEqual(
        graphFor({ symbol_id: "project::Caller", name: "New" }, []).nodes.map(
          (node) => node.symbol_id,
        ),
        ["project::Caller"],
      );
    },
  );
});

function successfulNavigation() {
  const navigation = new BrowserFocusNavigation(
    { view_id: "view-old", symbol_id: "old", name: "Old" },
    async ({ symbol_id }) => ({
      state: "ok",
      data: { view_id: "view-new", symbol_id, name: "New" },
    }),
  );

  return navigation;
}
