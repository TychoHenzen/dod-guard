import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectOneHopGraph,
  renderOneHopGraph,
} from "../../../browser/graph.js";

import { focus, loaded } from "./fixture.test.js";

describe("one-hop graph SVG", () => {
  it("does not render " + "discovery-only candidates as semantic edges", () => {
    const svg = renderOneHopGraph(
      projectOneHopGraph(focus, [
        loaded("references", [
          {
            symbol_id: "project::Suggested",
            name: "Suggested",
            discovery_only: true,
          },
        ]),
      ]),
    );

    assert.doesNotMatch(svg, /Suggested|data-edge-label/);
  });
});
