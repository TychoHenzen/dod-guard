import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectOneHopGraph,
  renderOneHopGraph,
} from "../../../browser/graph.js";

import { focus, loaded } from "./fixture.test.js";

describe("bounded graph growth", () => {
  it(
    "renders returned nodes and an honest " +
      "per-group omitted count without placeholders",
    () => {
      const svg = renderOneHopGraph(
        projectOneHopGraph(focus, [
          loaded(
            "references",
            [{ symbol_id: "project::Returned", name: "Returned" }],
            7,
          ),
        ]),
      );

      assert.match(svg, /data-omitted-relation="references">7 omitted/);
      assert.match(svg, /Returned/);
      assert.doesNotMatch(svg, /placeholder|unknown candidate/i);
    },
  );
});
