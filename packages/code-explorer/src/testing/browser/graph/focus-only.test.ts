import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectOneHopGraph } from "../../../browser/graph.js";

import { focus } from "./fixture.test.js";

describe("one-hop graph projection", () => {
  it("projects only the focus " + "before a relation group has loaded", () => {
    const graph = projectOneHopGraph(focus, []);

    assert.deepEqual(
      graph.nodes.map((node) => node.symbol_id),
      ["project::Focus"],
    );
    assert.deepEqual(graph.edges, []);
  });
});
