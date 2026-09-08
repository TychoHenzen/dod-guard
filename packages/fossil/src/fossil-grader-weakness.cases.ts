import assert from "node:assert/strict";
import { test } from "node:test";
import { referenceWeaknessScore } from "./fossil-grader.js";
import type { ReferenceGraph } from "./types.js";
import { referenceEdge } from "./fossil-grader.test-support.js";

test("counts duplicate strong inbound edges from one live source only once", () => {
  const graph: ReferenceGraph = {
    edges: [
      referenceEdge({ sourcePath: "src/live.ts", targetPath: "src/candidate.ts", start: 0, column: 1 }),
      {
        sourcePath: "src/live.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "require",
        strength: "strong",
        span: { start: 2, end: 3, line: 1, column: 3 },
      },
      {
        sourcePath: "src/weak.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "weak",
        span: { start: 4, end: 5, line: 1, column: 5 },
      },
      {
        sourcePath: "src/candidate.ts",
        targetPath: "src/outbound.ts",
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

  assert.equal(referenceWeaknessScore("src/candidate.ts", graph, new Set()), 0.5);
});
test("gives zero weakness when two unique live sources retain strong inbound references", () => {
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

  assert.equal(referenceWeaknessScore("src/candidate.ts", graph, new Set(["src/other-candidate.ts"])), 0);
});
