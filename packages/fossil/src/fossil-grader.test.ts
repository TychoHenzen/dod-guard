import assert from "node:assert/strict";
import { test } from "node:test";
import {
  abandonmentScore,
  clusterIsolationScore,
  normalizedBurstChurn,
  referenceWeaknessScore,
} from "./fossil-grader.js";
import type { BurstFileActivity, ReferenceGraph } from "./types.js";

function activity(path: string, burstCommits: number, postBurstCommits = 0): BurstFileActivity {
  return {
    identity: path,
    path,
    burstCommits,
    postBurstCommits,
    createdInBurst: true,
    existsAtHead: true,
  };
}

// covers: fossil/scoring :: Cluster isolation score :: Candidate only references fossils
test("gives full isolation when every unique resolved neighbor is a fossil candidate", () => {
  const graph: ReferenceGraph = {
    edges: [
      {
        sourcePath: "src/fossil-inbound.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 0, end: 1, line: 1, column: 1 },
      },
      {
        sourcePath: "src/candidate.ts",
        targetPath: "src/fossil-outbound.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 1, end: 2, line: 1, column: 2 },
      },
      {
        sourcePath: "src/fossil-outbound.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "require",
        strength: "strong",
        span: { start: 2, end: 3, line: 1, column: 3 },
      },
      {
        sourcePath: "src/candidate.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 3, end: 4, line: 1, column: 4 },
      },
      {
        sourcePath: "src/live-a.ts",
        targetPath: "src/live-b.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 4, end: 5, line: 1, column: 5 },
      },
    ],
    unresolved: [],
    complete: true,
    unavailablePaths: [],
  };

  assert.equal(
    clusterIsolationScore("src/candidate.ts", graph, new Set(["src/fossil-inbound.ts", "src/fossil-outbound.ts"])),
    1,
  );
});

// covers: fossil/scoring :: Cluster isolation score :: Candidate has no resolved neighbors
test("gives full isolation when self, unresolved, and unrelated references are the only evidence", () => {
  const graph: ReferenceGraph = {
    edges: [
      {
        sourcePath: "src/candidate.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 0, end: 1, line: 1, column: 1 },
      },
      {
        sourcePath: "src/other-a.ts",
        targetPath: "src/other-b.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 1, end: 2, line: 1, column: 2 },
      },
    ],
    unresolved: [
      {
        sourcePath: "src/candidate.ts",
        targetCandidates: ["src/missing.ts"],
        language: "typescript",
        kind: "import",
        span: { start: 2, end: 3, line: 1, column: 3 },
        resolution: "unresolved",
      },
    ],
    complete: false,
    unavailablePaths: ["src/missing.ts"],
  };

  assert.equal(clusterIsolationScore("src/candidate.ts", graph, new Set()), 1);
});

// covers: fossil/scoring :: Cluster isolation score :: Candidate only references live code
test("gives zero isolation when every unique resolved neighbor is live code", () => {
  const graph: ReferenceGraph = {
    edges: [
      {
        sourcePath: "src/live-inbound.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 0, end: 1, line: 1, column: 1 },
      },
      {
        sourcePath: "src/candidate.ts",
        targetPath: "src/live-outbound.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 1, end: 2, line: 1, column: 2 },
      },
      {
        sourcePath: "src/live-outbound.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "require",
        strength: "strong",
        span: { start: 2, end: 3, line: 1, column: 3 },
      },
    ],
    unresolved: [],
    complete: true,
    unavailablePaths: [],
  };

  assert.equal(clusterIsolationScore("src/candidate.ts", graph, new Set()), 0);
});

// covers: fossil/scoring :: Reference weakness score :: Only weak or vestigial references remain
test("gives full weakness when no unique strong live inbound source remains", () => {
  const graph: ReferenceGraph = {
    edges: [
      {
        sourcePath: "src/weak.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "weak",
        span: { start: 0, end: 1, line: 1, column: 1 },
      },
      {
        sourcePath: "src/vestigial.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "vestigial",
        span: { start: 1, end: 2, line: 1, column: 2 },
      },
      {
        sourcePath: "src/candidate.ts",
        targetPath: "src/live.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 2, end: 3, line: 1, column: 3 },
      },
      {
        sourcePath: "src/candidate.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 3, end: 4, line: 1, column: 4 },
      },
      {
        sourcePath: "src/other-candidate.ts",
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
        span: { start: 5, end: 6, line: 1, column: 6 },
      },
    ],
    unresolved: [],
    complete: true,
    unavailablePaths: [],
  };

  assert.equal(referenceWeaknessScore("src/candidate.ts", graph, new Set(["src/other-candidate.ts"])), 1);
});

// covers: fossil/scoring :: Reference weakness score :: One strong live reference remains
test("counts duplicate strong inbound edges from one live source only once", () => {
  const graph: ReferenceGraph = {
    edges: [
      {
        sourcePath: "src/live.ts",
        targetPath: "src/candidate.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 0, end: 1, line: 1, column: 1 },
      },
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

// covers: fossil/scoring :: Reference weakness score :: Multiple strong live references remain
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

// covers: fossil/scoring :: Abandonment score :: Complete abandonment scores one
test("scores a positive burst with no later commits as complete abandonment", () => {
  const candidate = activity("src/abandoned.ts", 4);
  const invalid = activity("src/invalid.ts", 0);
  const before = structuredClone({ candidate, invalid });

  assert.equal(abandonmentScore(candidate), 1);
  assert.equal(abandonmentScore(invalid), 0);
  assert.equal(Number.isFinite(abandonmentScore(invalid)), true);
  assert.deepEqual({ candidate, invalid }, before);
});

// covers: fossil/scoring :: Abandonment score :: Continued activity lowers abandonment linearly
test("lowers abandonment linearly and floors it at zero after continued activity", () => {
  const partial = activity("src/partial.ts", 4, 2);
  const equal = activity("src/equal.ts", 4, 4);
  const greater = activity("src/greater.ts", 4, 5);
  const before = structuredClone({ partial, equal, greater });

  assert.equal(abandonmentScore(partial), 0.5);
  assert.equal(abandonmentScore(equal), 0);
  assert.equal(abandonmentScore(greater), 0);
  assert.deepEqual({ partial, equal, greater }, before);
});

// covers: fossil/scoring :: Churn score :: Churn is normalized within a burst
test("normalizes positive churn within one burst without mutating activity input", () => {
  const candidate = activity("src/candidate.ts", 12);
  const maximum = activity("src/maximum.ts", 15);
  const before = structuredClone({ candidate, maximum });

  assert.equal(normalizedBurstChurn(candidate, [candidate, maximum]), 0.8);
  assert.equal(normalizedBurstChurn(maximum, [candidate, maximum]), 1);
  assert.deepEqual({ candidate, maximum }, before);
});

test("gives each tied positive maximum full normalized churn", () => {
  const first = activity("src/first.ts", 15);
  const second = activity("src/second.ts", 15);

  assert.equal(normalizedBurstChurn(first, [first, second]), 1);
  assert.equal(normalizedBurstChurn(second, [first, second]), 1);
});

test("returns finite zero for empty and nonpositive burst activity", () => {
  const zero = activity("src/zero.ts", 0);
  const negative = activity("src/negative.ts", -2);

  assert.equal(normalizedBurstChurn(zero, []), 0);
  assert.equal(normalizedBurstChurn(negative, [zero, negative]), 0);
  assert.equal(Number.isFinite(normalizedBurstChurn(negative, [zero, negative])), true);
});
