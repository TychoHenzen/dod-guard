import assert from "node:assert/strict";
import { test } from "node:test";
import { splitTemporalClusters } from "./git-analyzer.js";

test(
  "splits chronological commits when an adjacent gap is one millisecond " +
    "above the threshold",
  () => {
    const commits = [
      { hash: "first", committerTimestampMs: 1_000, changes: [] },
      { hash: "second", committerTimestampMs: 1_500, changes: [] },
      { hash: "third", committerTimestampMs: 2_001, changes: [] },
    ];

    const clusters = splitTemporalClusters(commits, 500);

    assert.deepEqual(
      clusters.map((cluster) => cluster.map((commit) => commit.hash)),
      [["first", "second"], ["third"]],
    );
  },
);

test(
  "keeps chronological commits together when their adjacent gap equals the " +
    "threshold",
  () => {
    const clusters = splitTemporalClusters(
      [
        { hash: "first", committerTimestampMs: 1_000, changes: [] },
        { hash: "second", committerTimestampMs: 1_500, changes: [] },
      ],
      500,
    );

    assert.deepEqual(
      clusters.map((cluster) => cluster.map((commit) => commit.hash)),
      [["first", "second"]],
    );
  },
);
