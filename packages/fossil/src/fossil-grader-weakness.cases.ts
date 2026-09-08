import assert from "node:assert/strict";
import { test } from "node:test";
import { referenceWeaknessScore } from "./fossil-grader.js";
import type { ReferenceGraph } from "./types.js";
import { referenceEdge } from "./fossil-grader.test-support.js";

test("counts duplicate strong inbound edges from one live source once", () => {
  const graph: ReferenceGraph = {
    edges: [
      referenceEdge({
        sourcePath: "src/live.ts",
        targetPath: "src/candidate.ts",
        start: 0,
        column: 1,
      }),
      referenceEdge({
        sourcePath: "src/live.ts",
        targetPath: "src/candidate.ts",
        start: 2,
        column: 3,
        kind: "require",
      }),
      referenceEdge({
        sourcePath: "src/weak.ts",
        targetPath: "src/candidate.ts",
        start: 4,
        column: 5,
        strength: "weak",
      }),
      referenceEdge({
        sourcePath: "src/candidate.ts",
        targetPath: "src/outbound.ts",
        start: 6,
        column: 7,
      }),
    ],
    unresolved: [],
    complete: true,
    unavailablePaths: [],
  };

  assert.equal(
    referenceWeaknessScore("src/candidate.ts", graph, new Set()),
    0.5,
  );
});
test("gives zero weakness for two unique live sources", () => {
  const graph: ReferenceGraph = {
    edges: [
      {
        sourcePath: "src/first-live.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 0, end: 1, line: 1, column: 1 },
      },
      {
        sourcePath: "src/first-live.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "dynamic-import",
        strength: "strong",
        span: { start: 2, end: 3, line: 1, column: 3 },
      },
      {
        sourcePath: "src/second-live.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 4, end: 5, line: 1, column: 5 },
      },
      {
        sourcePath: "src/other-candidate.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 6, end: 7, line: 1, column: 7 },
      },
    ],
    unresolved: [],
    complete: true,
    unavailablePaths: [],
  };

  assert.equal(
    referenceWeaknessScore(
      "src/candidate.ts",
      graph,
      new Set(["src/other-candidate.ts"]),
    ),
    0,
  );
});
