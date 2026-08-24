import assert from "node:assert/strict";
import { test } from "node:test";
import { type ReferenceCandidate, readReferenceSources, unsupportedCandidateReferenceGraph } from "./ref-analyzer.js";

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

// covers: fossil/reference-analysis :: Replaceable reference backend :: Unreadable source does not stop analysis
test("continues after an unreadable source without exposing its read error", () => {
  const attemptedPaths: string[] = [];
  const sources = [
    { path: "src/candidate.ts", language: "typescript" as const },
    { path: "src/live.ts", language: "typescript" as const },
  ];
  const readSource = (source: ReferenceCandidate) => {
    attemptedPaths.push(source.path);
    if (source.path === "src/candidate.ts") throw new Error("sensitive filesystem error");
    return "export const live = true;\n";
  };

  const result = readReferenceSources(sources, readSource);

  assert.deepEqual(attemptedPaths, ["src/candidate.ts", "src/live.ts"]);
  assert.deepEqual(result.sources, [
    { path: "src/live.ts", language: "typescript", content: "export const live = true;\n" },
  ]);
  assert.deepEqual(result.graph, {
    edges: [],
    unresolved: [],
    complete: false,
    unavailablePaths: ["src/candidate.ts"],
  });
  assert.deepEqual(result.warnings, [
    { code: "reference_unreadable", message: "Reference source could not be read.", path: "src/candidate.ts" },
  ]);
});
