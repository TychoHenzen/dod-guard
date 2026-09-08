import assert from "node:assert/strict";
import { test } from "node:test";
import {
  candidateReferenceSubscores,
  createAdvisoryFossilFinding,
  meetsFossilThreshold,
  qualifyingBurstCandidates,
  scoreFossilSubscores,
} from "./fossil-grader.js";
import type { FossilSubscores, ReferenceGraph } from "./types.js";
import { advisoryFindingInput } from "./testing/report-fixtures.js";
import { activity, referenceEdge } from "./fossil-grader.test-support.js";

test("combines all available subscores with the fixed full-evidence weights", () => {
  const subscores: FossilSubscores = {
    churn: 0.4,
    abandonment: 0.6,
    referenceWeakness: 0.7,
    clusterIsolation: 0.8,
  };

  assert.deepEqual(scoreFossilSubscores(subscores), { score: 0.59, basis: "full" });
});
test("renormalizes Git subscores when both reference signals are unavailable", () => {
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
test("retains independently qualifying evidence for one path in multiple bursts", () => {
  const first = {
    burstId: "burst-1",
    activity: activity("src/reused.ts", 3, 0),
    score: { score: 0.7, basis: "full" as const },
  };
  const second = {
    burstId: "burst-2",
    activity: activity("src/reused.ts", 8, 2),
    score: { score: 0.8, basis: "git-only" as const },
  };

  const qualified = qualifyingBurstCandidates([first, second], 0.7);

  assert.deepEqual(qualified, [first, second]);
  assert.notEqual(qualified[0]?.activity, qualified[1]?.activity);
  assert.equal(qualified[0]?.activity.burstCommits, 3);
  assert.equal(qualified[1]?.activity.burstCommits, 8);
});
test("omits both reference subscores together when candidate reference evidence is incomplete", () => {
  const graph: ReferenceGraph = {
    edges: [
      referenceEdge({ sourcePath: "src/live.ts", targetPath: "src/candidate.ts", start: 0, column: 1 }),
      {
        sourcePath: "src/candidate.ts",
        targetPath: "src/fossil.ts",
        language: "typescript",
        kind: "import",
        strength: "strong",
        span: { start: 1, end: 2, line: 1, column: 2 },
      },
    ],
    unresolved: [],
    complete: false,
    unavailablePaths: ["src/candidate.ts"],
  };

  assert.deepEqual(candidateReferenceSubscores("src/candidate.ts", graph, new Set(["src/fossil.ts"])), {
    available: false,
  });
  assert.deepEqual(
    candidateReferenceSubscores(
      "src/candidate.ts",
      { ...graph, complete: true, unavailablePaths: [] },
      new Set(["src/fossil.ts"]),
    ),
    { available: true, referenceWeakness: 0.5, clusterIsolation: 0.5 },
  );
});
test("keeps a maximum-score fossil finding advisory", () => {
  const finding = createAdvisoryFossilFinding(
    advisoryFindingInput({ burstId: "burst-1", path: "src/candidate.ts", score: 1, burstCommits: 5 }),
  );

  assert.equal(finding.score, 1);
  assert.equal(finding.classification, "advisory");
});
