import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBurstReports } from "./repository-analysis-findings.js";
import type { Burst } from "./types.js";

test("builds a report boundary for each analyzed burst", () => {
  const burst: Burst = {
    id: "burst-1",
    startTimestampMs: 0,
    endTimestampMs: 1,
    commits: [],
    files: [],
    closed: true,
  };
  const references = {
    sources: [],
    warnings: [],
    acceptedBytes: 0,
    graph: {
      edges: [],
      unresolved: [],
      complete: true,
      unavailablePaths: [],
    },
  } as Parameters<typeof buildBurstReports>[1];

  const [report] = buildBurstReports([burst], references, 0.4);

  assert.equal(report?.id, "burst-1");
  assert.deepEqual(report?.findings, []);
});
