import assert from "node:assert/strict";
import { test } from "node:test";
import { splitAtChangePoint } from "./git-analyzer.js";

test("splits close disjoint work when inverse-frequency weighting suppresses the shared file", () => {
  const hour = 60 * 60 * 1_000;
  const paths = [
    ["shared.ts", "left-a.ts"],
    ["shared.ts", "left-b.ts"],
    ["shared.ts", "left-c.ts"],
    ["shared.ts", "left-a.ts"],
    ["shared.ts", "left-b.ts"],
    ["shared.ts", "right-a.ts"],
    ["shared.ts", "right-b.ts"],
    ["shared.ts", "right-c.ts"],
    ["shared.ts", "right-a.ts"],
    ["shared.ts", "right-b.ts"],
  ];
  const commits = paths.map((changedPaths, index) => ({
    hash: `${index}`,
    committerTimestampMs: index < 5 ? index * hour : (index + 3) * hour,
    changes: changedPaths.map((path) => ({ status: "modified" as const, path })),
  }));
  const leftFiles = new Set(commits.slice(0, 5).flatMap((commit) => commit.changes.map((change) => change.path)));
  const rightFiles = new Set(commits.slice(5).flatMap((commit) => commit.changes.map((change) => change.path)));
  const unweightedSimilarity =
    [...leftFiles].filter((path) => rightFiles.has(path)).length / new Set([...leftFiles, ...rightFiles]).size;

  assert.equal(unweightedSimilarity, 1 / 7);
  assert.ok(unweightedSimilarity > 0.1);

  const partitions = splitAtChangePoint(commits);

  assert.deepEqual(
    partitions.map((partition) => partition.map((commit) => commit.hash)),
    [
      ["0", "1", "2", "3", "4"],
      ["5", "6", "7", "8", "9"],
    ],
  );
});

test("keeps close low-similarity work together when a side is too small", () => {
  const hour = 60 * 60 * 1_000;
  const fourCommitPartition = ["left-a.ts", "left-b.ts", "left-c.ts", "left-a.ts"];
  const fiveCommitPartition = ["right-a.ts", "right-b.ts", "right-c.ts", "right-a.ts", "right-b.ts"];
  const fewerThanFiveCommits = [...fourCommitPartition, ...fiveCommitPartition].map((path, index) => ({
    hash: `commit-${index}`,
    committerTimestampMs: index < 4 ? index * hour : (index + 3) * hour,
    changes: [{ status: "modified" as const, path }],
  }));
  const fewerThanThreeFiles = [
    "left-a.ts",
    "left-b.ts",
    "left-a.ts",
    "left-b.ts",
    "left-a.ts",
    "right-a.ts",
    "right-b.ts",
    "right-c.ts",
    "right-a.ts",
    "right-b.ts",
  ].map((path, index) => ({
    hash: `few-files-${index}`,
    committerTimestampMs: index < 5 ? index * hour : (index + 3) * hour,
    changes: [{ status: "modified" as const, path }],
  }));

  assert.deepEqual(splitAtChangePoint(fewerThanFiveCommits), [fewerThanFiveCommits]);
  assert.deepEqual(splitAtChangePoint(fewerThanThreeFiles), [fewerThanThreeFiles]);
});
