import assert from "node:assert/strict";
import { test } from "node:test";
import {
  selectDeletedNonSurvivorPaths,
  selectFossilCandidates,
} from "./git-analyzer.js";
import { maximumFileActivity } from "./git-analyzer.test-support.js";

test("selects only current files that meet neither survivor rule", () => {
  const files = [
    {
      identity: "quiet",
      path: "quiet.ts",
      burstCommits: 1,
      postBurstCommits: 1,
      createdInBurst: true,
      existsAtHead: true,
    },
    {
      identity: "absolute-survivor",
      path: "absolute-survivor.ts",
      burstCommits: 1,
      postBurstCommits: 3,
      createdInBurst: true,
      existsAtHead: true,
    },
    {
      identity: "relative-survivor",
      path: "relative-survivor.ts",
      burstCommits: 1,
      postBurstCommits: 20,
      createdInBurst: true,
      existsAtHead: true,
    },
    maximumFileActivity,
    {
      identity: "deleted",
      path: "deleted.ts",
      burstCommits: 1,
      postBurstCommits: 1,
      createdInBurst: true,
      existsAtHead: false,
    },
  ];

  assert.deepEqual(selectFossilCandidates(files), [files[0]]);
});

test("records deleted non-survivors separately from current candidates", () => {
  const files = [
    {
      identity: "deleted-quiet",
      path: "deleted-quiet.ts",
      burstCommits: 1,
      postBurstCommits: 1,
      createdInBurst: true,
      existsAtHead: false,
    },
    {
      identity: "current-quiet",
      path: "current-quiet.ts",
      burstCommits: 1,
      postBurstCommits: 1,
      createdInBurst: true,
      existsAtHead: true,
    },
    {
      identity: "deleted-survivor",
      path: "deleted-survivor.ts",
      burstCommits: 1,
      postBurstCommits: 100,
      createdInBurst: true,
      existsAtHead: false,
    },
  ];

  assert.deepEqual(selectFossilCandidates(files), [files[1]]);
  assert.deepEqual(selectDeletedNonSurvivorPaths(files), ["deleted-quiet.ts"]);
});
