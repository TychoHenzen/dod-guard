import assert from "node:assert/strict";
import { test } from "node:test";
import { unsupportedCandidateReferenceGraph } from "./ref-analyzer.js";

// covers: fossil/reference-analysis :: Replaceable reference backend :: Unsupported language degrades to Git evidence
test("marks unsupported candidate references unavailable without producing edges", () => {
  const candidates = [
    { path: "src/candidate.lua", language: "unsupported" as const },
    { path: "src/live.ts", language: "typescript" as const },
  ];
  assert.doesNotThrow(() => unsupportedCandidateReferenceGraph(candidates));
  const graph = unsupportedCandidateReferenceGraph(candidates);

  assert.deepEqual(graph, {
    edges: [],
    unresolved: [],
    complete: false,
    unavailablePaths: ["src/candidate.lua"],
  });
});
