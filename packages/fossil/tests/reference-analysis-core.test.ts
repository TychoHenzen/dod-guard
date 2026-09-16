import assert from "node:assert/strict";
import { test } from "node:test";
import { unsupportedCandidateReferenceGraph } from "../src/ref-analyzer.js";

test("marks unsupported candidates as incomplete evidence", () => {
  const graph = unsupportedCandidateReferenceGraph([
    { path: "src/file.lua", language: "unsupported" },
  ]);

  assert.equal(graph.complete, false);
  assert.deepEqual(graph.unavailablePaths, ["src/file.lua"]);
});
