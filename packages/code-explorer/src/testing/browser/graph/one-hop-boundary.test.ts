import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectOneHopGraph } from "../../../browser/graph.js";

import { focus, loaded } from "./fixture.test.js";

describe("one-hop graph projection", () => {
  it(
    "does not recursively expand a " + "returned candidate's known relations",
    () => {
      const graph = projectOneHopGraph(focus, [
        loaded("callees", [
          {
            symbol_id: "project::FirstHop",
            name: "First hop",
            known_relations: ["project::SecondHop"],
          },
        ]),
      ]);

      assert.deepEqual(
        graph.nodes.map((node) => node.symbol_id),
        ["project::Focus", "project::FirstHop"],
      );
      assert.equal(graph.edges.length, 1);
      assert.doesNotMatch(JSON.stringify(graph), /SecondHop/);
    },
  );
});
