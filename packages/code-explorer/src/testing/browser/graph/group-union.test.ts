import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectOneHopGraph } from "../../../browser/graph.js";

import { focus, loaded } from "./fixture.test.js";

describe("bounded graph growth", () => {
  it(
    "uses the union of several " + "returned groups without recursive nodes",
    () => {
      const graph = projectOneHopGraph(focus, [
        loaded(
          "references",
          [
            {
              symbol_id: "project::Reference",
              name: "Reference",
              known_relations: ["project::Hidden"],
            },
          ],
          1,
        ),
        loaded(
          "callees",
          [{ symbol_id: "project::Callee", name: "Callee" }],
          2,
        ),
        loaded("implementations", [
          { symbol_id: "project::Implementation", name: "Implementation" },
        ]),
      ]);

      assert.deepEqual(
        graph.nodes.map((node) => node.symbol_id),
        [
          "project::Focus",
          "project::Reference",
          "project::Callee",
          "project::Implementation",
        ],
      );
      assert.equal(graph.edges.length, 3);
      assert.doesNotMatch(JSON.stringify(graph), /Hidden/);
    },
  );
});
