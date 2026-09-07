import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderGraphArea } from "../../../browser/graph-navigation.js";

describe("graph navigation and view ownership", () => {
  it("contains malformed graph rendering at the SVG area", () => {
    const malformed = {
      nodes: [
        { symbol_id: "focus", name: "Focus", center: true, selectable: false },
      ],
      edges: [{ from: "missing", to: "focus", label: "caller" }],
      omitted: new Map(),
    } as const;

    assert.match(renderGraphArea(malformed), /graph_render_failed/);
    assert.equal(renderGraphArea(malformed).includes("source"), false);
  });
});
