import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectOneHopGraph,
  renderOneHopGraph,
} from "../../../browser/graph.js";

import { focus, loaded } from "./fixture.test.js";

describe("one-hop graph SVG", () => {
  it(
    "renders separate semantic edges " +
      "when one node has two proved relations",
    () => {
      const svg = renderOneHopGraph(
        projectOneHopGraph(focus, [
          loaded("callers", [{ symbol_id: "project::Shared", name: "Shared" }]),
          loaded("definition", [
            { symbol_id: "project::Shared", name: "Shared" },
          ]),
        ]),
      );

      assert.match(svg, /data-edge-label="caller"/);
      assert.match(svg, /data-edge-label="definition"/);
    },
  );
});
