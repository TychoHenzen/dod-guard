import assert from "node:assert/strict";
import { test } from "node:test";
import {
  candidateReferenceSubscores,
  meetsFossilThreshold,
  scoreFossilSubscores,
} from "./fossil-grader.js";
import type { FossilSubscores, ReferenceGraph } from "./types.js";
import { activity, referenceEdge } from "./fossil-grader.test-support.js";

test("combines all subscores with fixed full-evidence weights", () => {
  const subscores: FossilSubscores = {
    churn: 0.4,
    abandonment: 0.6,
    referenceWeakness: 0.7,
    clusterIsolation: 0.8,
  };

  assert.deepEqual(scoreFossilSubscores(subscores), {
    score: 0.59,
    basis: "full",
  });
});
test("renormalizes Git subscores without reference signals", () => {
  const subscores: FossilSubscores = { churn: 0.4, abandonment: 0.6 };

  assert.deepEqual(scoreFossilSubscores(subscores), {
    score: (0.3 / 0.65) * 0.4 + (0.35 / 0.65) * 0.6,
    basis: "git-only",
  });
});
test("includes scores exactly at the configured finding threshold", () => {
  assert.equal(meetsFossilThreshold(0.7, 0.7), true);
  assert.equal(meetsFossilThreshold(0.699_999, 0.7), false);
});
test("omits both reference subscores when evidence is incomplete", () => {
  const liveEdge = referenceEdge({
    sourcePath: "src/live.ts",
    targetPath: "src/candidate.ts",
    start: 0,
    column: 1,
  });
  const graph: ReferenceGraph = {
    edges: [
      liveEdge,
      referenceEdge({
        sourcePath: "src/candidate.ts",
        targetPath: "src/fossil.ts",
        start: 1,
        column: 2,
      }),
    ],
    unresolved: [],
    complete: false,
    unavailablePaths: ["src/candidate.ts"],
  };

  assert.deepEqual(
    candidateReferenceSubscores(
      "src/candidate.ts",
      graph,
      new Set(["src/fossil.ts"]),
    ),
    {
      available: false,
    },
  );
  assert.deepEqual(
    candidateReferenceSubscores(
      "src/candidate.ts",
      { ...graph, complete: true, unavailablePaths: [] },
      new Set(["src/fossil.ts"]),
    ),
    { available: true, referenceWeakness: 0.5, clusterIsolation: 0.5 },
  );
});
