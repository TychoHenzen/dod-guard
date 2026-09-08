import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyHistoryWarnings,
  futureCommitWarnings,
  parseNonMergeGitLog,
  retainClosedTemporalClusters,
  shallowHistoryWarnings,
  shallowRepositoryArguments,
  sparseCheckoutArguments,
  sparseCheckoutWarnings,
  splitAtChangePoint,
  splitTemporalClusters,
} from "./git-analyzer.js";
import "./git-history-warnings-more.cases.js";

test(
  "reports future commits and leaves their temporal " + "cluster unfinished",
  () => {
    const analysisTimestampMs = 10_000;
    const cluster = [
      {
        hash: "past",
        committerTimestampMs: 8_000,
        changes: [{ status: "modified" as const, path: "past.ts" }],
      },
      {
        hash: "z-future",
        committerTimestampMs: 10_001,
        changes: [{ status: "modified" as const, path: "future-z.ts" }],
      },
      {
        hash: "a-future",
        committerTimestampMs: 10_001,
        changes: [{ status: "modified" as const, path: "future-a.ts" }],
      },
      {
        hash: "later",
        committerTimestampMs: 8_002,
        changes: [{ status: "modified" as const, path: "later.ts" }],
      },
      {
        hash: "latest",
        committerTimestampMs: 8_003,
        changes: [{ status: "modified" as const, path: "latest.ts" }],
      },
    ];

    assert.deepEqual(futureCommitWarnings(cluster, analysisTimestampMs), [
      {
        code: "future_commit",
        message:
          "Commit a-future has a committer timestamp after analysis time.",
      },
      {
        code: "future_commit",
        message:
          "Commit z-future has a committer timestamp after analysis time.",
      },
    ]);
    assert.deepEqual(
      retainClosedTemporalClusters([cluster], analysisTimestampMs, 1_000),
      [],
    );
  },
);
