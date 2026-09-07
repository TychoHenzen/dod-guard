import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectOneHopGraph } from "../../../browser/graph.js";

import { focus, loaded } from "./fixture.test.js";

describe("one-hop graph projection", () => {
  it(
    "deduplicates normalized identities " + "while retaining both direct edges",
    () => {
      const graph = projectOneHopGraph(focus, [
        loaded("callers", [{ symbol_id: "project::Same", name: "Same" }]),
        loaded("references", [
          { symbol_id: "project::Same", name: "Same reference" },
        ]),
      ]);

      assert.deepEqual(
        graph.nodes.map((node) => node.symbol_id),
        ["project::Focus", "project::Same"],
      );
      assert.deepEqual(
        graph.edges.map((edge) => edge.label),
        ["reference", "caller"],
      );
    },
  );
});
