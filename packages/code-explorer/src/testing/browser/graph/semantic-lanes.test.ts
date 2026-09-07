import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectOneHopGraph,
  renderOneHopGraph,
} from "../../../browser/graph.js";

import { focus, loaded } from "./fixture.test.js";

describe("one-hop graph SVG", () => {
  it(
    "places incoming and outgoing " +
      "semantic relations on their declared lanes",
    () => {
      const svg = renderOneHopGraph(
        projectOneHopGraph(focus, [
          loaded("callers", [{ symbol_id: "project::Caller", name: "Caller" }]),
          loaded("callees", [{ symbol_id: "project::Callee", name: "Callee" }]),
        ]),
      );

      assert.match(
        svg,
        /data-node-id="project::Caller" data-lane="incoming" x="16%"/,
      );
      assert.match(
        svg,
        /data-node-id="project::Focus" data-lane="center" x="50%"/,
      );
      assert.match(
        svg,
        /data-node-id="project::Callee" data-lane="outgoing" x="84%"/,
      );
      assert.match(svg, /data-edge-label="caller" data-direction="incoming"/);
      assert.match(svg, /data-edge-label="callee" data-direction="outgoing"/);
    },
  );
});
