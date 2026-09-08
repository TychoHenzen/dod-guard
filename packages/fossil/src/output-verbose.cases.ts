import assert from "node:assert/strict";
import { test } from "node:test";
import { burstTableRows } from "./output.js";
import type { BurstReport } from "./types.js";

test("adds exactly one verbose explanation immediately after each candidate", () => {
  const activity = (path: string, createdInBurst: boolean, burstCommits: number, postBurstCommits: number) => ({
    identity: path,
    path,
    createdInBurst,
    burstCommits,
    postBurstCommits,
    existsAtHead: true,
  });
  const burst: BurstReport = {
    id: "verbose-burst",
    startTimestampMs: Date.UTC(2025, 0, 1),
    endTimestampMs: Date.UTC(2025, 0, 2),
    commitCount: 2,
    fileCount: 2,
    survivors: [],
    findings: [
      {
        classification: "advisory",
        burstId: "verbose-burst",
        path: "src/unavailable.ts",
        activity: activity("src/unavailable.ts", true, 3, 0),
        score: 0.9,
        scoreBasis: "git-only",
        subscores: { churn: 1, abandonment: 1 },
        referenceAvailability: "unavailable",
        strongInboundReferences: 0,
        candidateNeighbors: [],
        liveNeighbors: [],
      },
      {
        classification: "advisory",
        burstId: "verbose-burst",
        path: "src/complete.ts",
        activity: activity("src/complete.ts", false, 2, 4),
        score: 0.8,
        scoreBasis: "full",
        subscores: { churn: 0.5, abandonment: 0, referenceWeakness: 0.5, clusterIsolation: 0.5 },
        referenceAvailability: "complete",
        strongInboundReferences: 1,
        candidateNeighbors: ["./src/candidate.ts"],
        liveNeighbors: ["src\\live.ts"],
      },
    ],
    deletedPaths: [],
  };

  assert.deepEqual(
    burstTableRows([burst], "normal").map((row) => row.kind),
    ["burst", "finding", "finding"],
  );
  assert.deepEqual(burstTableRows([burst], "verbose"), [
    {
      kind: "burst",
      id: "verbose-burst",
      startDate: "2025-01-01",
      endDate: "2025-01-02",
      commitCount: 2,
      fileCount: 2,
    },
    { kind: "finding", path: "src/unavailable.ts", score: 0.9, scoreBasis: "git-only" },
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
    { kind: "finding", path: "src/complete.ts", score: 0.8, scoreBasis: "full" },
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
