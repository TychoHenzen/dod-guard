import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectOneHopGraph } from "../../../browser/graph.js";
import { renderGraphArea } from "../../../browser/graph-navigation.js";

import { focus, loaded } from "./fixture.test.js";

describe("graph navigation and view ownership", () => {
  it(
    "collapses only the graph " + "presentation without discarding graph state",
    () => {
      const graph = projectOneHopGraph(focus, [
        loaded("callees", [{ symbol_id: "project::Callee", name: "Callee" }]),
      ]);

      assert.match(
        renderGraphArea(graph, { collapsed: true }),
        /data-state="collapsed"/,
      );
      assert.deepEqual(
        graph.nodes.map((node) => node.symbol_id),
        ["project::Focus", "project::Callee"],
      );
    },
  );
});
