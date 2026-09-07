import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectOneHopGraph,
  renderOneHopGraph,
} from "../../../browser/graph.js";

import { focus, loaded } from "./fixture.test.js";

describe("one-hop graph SVG", () => {
  it(
    "labels a reference without " + "inventing caller or callee evidence",
    () => {
      const svg = renderOneHopGraph(
        projectOneHopGraph(focus, [
          loaded("references", [{ symbol_id: "project::Ref", name: "Ref" }]),
        ]),
      );

      assert.match(svg, /data-edge-label="reference"/);
      assert.doesNotMatch(
        svg,
        /data-edge-label="caller"|data-edge-label="callee"/,
      );
    },
  );
});
