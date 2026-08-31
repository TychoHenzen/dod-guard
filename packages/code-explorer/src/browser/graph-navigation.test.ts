import assert from "node:assert/strict";
import { test } from "node:test";
import { graphSnapshot, renderGraphArea, toGraphRelationGroups } from "./graph-navigation.js";

test("projects browser relations into immutable graph input", () => {
  const groups = toGraphRelationGroups([
    {
      relation: "references",
      state: "loaded",
      omitted_count: 2,
      candidates: [
        { name: "Local", external: false, symbol_id: "project::Local", local_handle: "handle" },
        { name: "External", external: true },
      ],
    },
  ]);

  assert.deepEqual(groups, [
    {
      relation: "references",
      state: "loaded",
      omitted_count: 2,
      candidates: [{ symbol_id: "project::Local", name: "Local", external: false, discovery_only: undefined }],
    },
  ]);
});

test("snapshots graph data and contains rendering failures", () => {
  const graph = {
    nodes: [{ symbol_id: "focus", name: "Focus", center: true, selectable: false }],
    edges: [],
    omitted: new Map([["references" as const, 3]]),
  };

  assert.deepEqual(graphSnapshot(graph, true), {
    nodes: [{ symbol_id: "focus", name: "Focus", center: true, selectable: false }],
    edges: [],
    omitted: [["references", 3]],
    stale: true,
  });
  assert.match(
    renderGraphArea({ ...graph, edges: [{ from: "missing", to: "focus", label: "caller" }] }),
    /graph_render_failed/,
  );
});
