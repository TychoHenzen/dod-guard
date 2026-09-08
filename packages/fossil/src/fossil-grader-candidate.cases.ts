import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateFinding } from "./repository-analysis-candidate-finding.js";
import type { Burst, ReferenceGraph } from "./types.js";
import { activity } from "./fossil-grader.test-support.js";

test("candidate finding honors its configured threshold", () => {
  const candidate = activity("src/reused.ts", 3);
  const burst: Burst = {
    id: "burst-1",
    startTimestampMs: 0,
    endTimestampMs: 1,
    commits: [],
    files: [candidate],
    closed: true,
  };
  const graph: ReferenceGraph = {
    edges: [],
    unresolved: [],
    complete: true,
    unavailablePaths: [],
  };

  const findings = candidateFinding({
    candidate,
    burst,
    graph,
    candidatePaths: new Set([candidate.path]),
    threshold: 0.9,
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.path, candidate.path);
});
