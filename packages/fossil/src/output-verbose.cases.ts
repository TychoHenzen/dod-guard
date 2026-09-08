import assert from "node:assert/strict";
import { test } from "node:test";
import { burstTableRows } from "./output.js";
import { VERBOSE_BURST_FIXTURE } from "./output-verbose-fixture.js";

test(
  "adds exactly one verbose explanation immediately after each candidate",
  () => {
  assert.deepEqual(
    burstTableRows([VERBOSE_BURST_FIXTURE], "normal").map((row) => row.kind),
    ["burst", "finding", "finding"],
  );
  assert.deepEqual(burstTableRows([VERBOSE_BURST_FIXTURE], "verbose"), [
    {
      kind: "burst",
      id: "verbose-burst",
      startDate: "2025-01-01",
      endDate: "2025-01-02",
      commitCount: 2,
      fileCount: 2,
    },
    {
      kind: "finding",
      path: "src/unavailable.ts",
      score: 0.9,
      scoreBasis: "git-only",
    },
    {
      kind: "finding-explanation",
      createdInBurst: true,
      burstCommits: 3,
      postBurstCommits: 0,
      referenceAvailability: "unavailable",
      strongInboundReferences: 0,
      candidateNeighbors: [],
      liveNeighbors: [],
    },
    {
      kind: "finding",
      path: "src/complete.ts",
      score: 0.8,
      scoreBasis: "full",
    },
    {
      kind: "finding-explanation",
      createdInBurst: false,
      burstCommits: 2,
      postBurstCommits: 4,
      referenceAvailability: "complete",
      strongInboundReferences: 1,
      candidateNeighbors: ["src/candidate.ts"],
      liveNeighbors: ["src/live.ts"],
    },
  ]);
});
