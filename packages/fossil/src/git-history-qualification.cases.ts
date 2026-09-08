import assert from "node:assert/strict";
import { test } from "node:test";
import {
  retainClosedTemporalClusters,
  retainQualifiedClosedClusters,
} from "./git-analyzer.js";

test("drops closed clusters below either qualification minimum", () => {
  const fewerThanFiveCommits = [
    { hash: "one", committerTimestampMs: 1, changes: [{ status: "added" as const, path: "one.ts" }] },
    { hash: "two", committerTimestampMs: 2, changes: [{ status: "added" as const, path: "two.ts" }] },
    { hash: "three", committerTimestampMs: 3, changes: [{ status: "added" as const, path: "three.ts" }] },
    { hash: "four", committerTimestampMs: 4, changes: [{ status: "modified" as const, path: "one.ts" }] },
  ];
  const fewerThanThreeLogicalFiles = [
    { hash: "five", committerTimestampMs: 5, changes: [{ status: "added" as const, path: "first.ts" }] },
    {
      hash: "six",
      committerTimestampMs: 6,
      changes: [{ status: "renamed" as const, previousPath: "first.ts", path: "second.ts" }],
    },
    {
      hash: "seven",
      committerTimestampMs: 7,
      changes: [{ status: "renamed" as const, previousPath: "second.ts", path: "third.ts" }],
    },
    { hash: "eight", committerTimestampMs: 8, changes: [{ status: "modified" as const, path: "third.ts" }] },
    { hash: "nine", committerTimestampMs: 9, changes: [{ status: "modified" as const, path: "third.ts" }] },
  ];
  const exactMinimum = [
    { hash: "ten", committerTimestampMs: 10, changes: [{ status: "added" as const, path: "alpha.ts" }] },
    { hash: "eleven", committerTimestampMs: 11, changes: [{ status: "added" as const, path: "beta.ts" }] },
    { hash: "twelve", committerTimestampMs: 12, changes: [{ status: "added" as const, path: "gamma.ts" }] },
    { hash: "thirteen", committerTimestampMs: 13, changes: [{ status: "modified" as const, path: "alpha.ts" }] },
    { hash: "fourteen", committerTimestampMs: 14, changes: [{ status: "modified" as const, path: "beta.ts" }] },
  ];

  assert.deepEqual(retainQualifiedClosedClusters([fewerThanFiveCommits, fewerThanThreeLogicalFiles, exactMinimum]), [
    exactMinimum,
  ]);
});

test("excludes recent qualifying clusters before closed-cluster qualification", () => {
  const analysisTimestampMs = 10_000;
  const gapMilliseconds = 1_000;
  const clusterEndingAt = (prefix: string, endTimestampMs: number) =>
    Array.from({ length: 5 }, (_, index) => ({
      hash: `${prefix}-${index}`,
      committerTimestampMs: endTimestampMs - 4 + index,
      changes: [{ status: "modified" as const, path: `${prefix}-${index % 3}.ts` }],
    }));
  const recent = clusterEndingAt("recent", analysisTimestampMs - gapMilliseconds + 1);
  const closed = clusterEndingAt("closed", analysisTimestampMs - gapMilliseconds);

  const inactiveClusters = retainClosedTemporalClusters([recent, closed], analysisTimestampMs, gapMilliseconds);

  assert.deepEqual(inactiveClusters, [closed]);
  assert.deepEqual(retainQualifiedClosedClusters(inactiveClusters), [closed]);
});
