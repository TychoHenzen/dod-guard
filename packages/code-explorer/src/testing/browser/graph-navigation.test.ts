import assert from "node:assert/strict";
import { test } from "node:test";
import { graphFor, renderGraphArea } from "../../browser/graph-navigation.js";

test("projects browser relations into immutable graph input", () => {
  const graph = graphFor(
    { symbol_id: "focus", name: "Focus" },
    [
    {
      relation: "references",
      state: "loaded",
      omitted_count: 2,
      candidates: [
        { name: "Local", external: false, symbol_id: "project::Local", local_handle: "handle" },
        { name: "External", external: true },
      ],
    },
    ],
  );

  assert.deepEqual(graph, {
    nodes: [
      { symbol_id: "focus", name: "Focus", center: true, selectable: false },
      { symbol_id: "project::Local", name: "Local", center: false, selectable: true },
    ],
    edges: [{ from: "project::Local", to: "focus", label: "reference" }],
    omitted: new Map([["references", 2]]),
  });
});

test("contains graph rendering failures", () => {
  const graph = {
    nodes: [{ symbol_id: "focus", name: "Focus", center: true, selectable: false }],
    edges: [],
    omitted: new Map([["references" as const, 3]]),
  };

  assert.match(
    renderGraphArea({ ...graph, edges: [{ from: "missing", to: "focus", label: "caller" }] }),
    /graph_render_failed/,
  );
});
