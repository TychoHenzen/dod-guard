import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectOneHopGraph,
  renderOneHopGraph,
} from "../../../browser/graph.js";

import { focus, loaded } from "./fixture.test.js";

describe("one-hop graph SVG", () => {
  it(
    "renders identical graph data " + "in identical order on every pass",
    () => {
      const graph = projectOneHopGraph(focus, [
        loaded("references", [
          { symbol_id: "project::First", name: "First" },
          { symbol_id: "project::Second", name: "Second" },
        ]),
        loaded("callees", [{ symbol_id: "project::Third", name: "Third" }]),
      ]);

      assert.equal(renderOneHopGraph(graph), renderOneHopGraph(graph));
    },
  );
});
