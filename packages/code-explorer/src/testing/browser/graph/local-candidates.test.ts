import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectOneHopGraph } from "../../../browser/graph.js";

import { focus, loaded } from "./fixture.test.js";

describe("one-hop graph projection", () => {
  it(
    "adds only local returned candidates " +
      "and direct edges from one loaded group",
    () => {
      const graph = projectOneHopGraph(focus, [
        loaded("callers", [
          { symbol_id: "project::Caller", name: "Caller" },
          { symbol_id: "external::Thing", name: "Thing", external: true },
        ]),
      ]);

      assert.deepEqual(
        graph.nodes.map((node) => node.symbol_id),
        ["project::Focus", "project::Caller"],
      );
      assert.deepEqual(
        graph.edges.map((edge) => [edge.from, edge.to, edge.label]),
        [["project::Caller", "project::Focus", "caller"]],
      );
    },
  );
});
