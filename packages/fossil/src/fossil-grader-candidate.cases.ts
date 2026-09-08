import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateFinding } from "./repository-analysis-candidate-finding.js";
import { strongInboundCount } from "./repository-analysis-candidate-scoring.js";
import type { Burst, ReferenceGraph } from "./types.js";
import { activity, referenceEdge } from "./fossil-grader.test-support.js";

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

test("counts only unique strong inbound references from live sources", () => {
  const candidatePath = "src/candidate.ts";
  const graph: ReferenceGraph = {
    edges: [
      referenceEdge({
        sourcePath: "src/live.ts",
        targetPath: "src/other.ts",
        start: 0,
        column: 1,
      }),
      referenceEdge({
        sourcePath: "src/live.ts",
        targetPath: candidatePath,
        start: 1,
        column: 2,
        strength: "weak",
      }),
      referenceEdge({
        sourcePath: candidatePath,
        targetPath: candidatePath,
        start: 2,
        column: 3,
      }),
      referenceEdge({
        sourcePath: "src/live.ts",
        targetPath: candidatePath,
        start: 3,
        column: 4,
      }),
      referenceEdge({
        sourcePath: "src/live.ts",
        targetPath: candidatePath,
        start: 4,
        column: 5,
      }),
    ],
    unresolved: [],
    complete: true,
    unavailablePaths: [],
  };

  assert.equal(
    strongInboundCount(graph, candidatePath, new Set([candidatePath])),
    1,
  );
});
