import assert from "node:assert/strict";
import { test } from "node:test";
import { splitAtChangePoint } from "./git-analyzer.js";
import { changePointCommits, changePointPartitionLengths } from "./git-analyzer.test-support.js";

test("ranks close change points deterministically and recursively splits both sides", () => {
  const hour = 60 * 60 * 1_000;
  const uniqueFileSets = Array.from({ length: 11 }, (_, index) => [
    `file-${index}-a.ts`,
    `file-${index}-b.ts`,
    `file-${index}-c.ts`,
  ]);
  const lowerSimilarityWins = uniqueFileSets.map((paths) => [...paths]);
  lowerSimilarityWins[5][0] = "bridge.ts";
  lowerSimilarityWins[6][0] = "bridge.ts";

  assert.deepEqual(
    changePointPartitionLengths(
      lowerSimilarityWins,
      new Map([
        [5, 4 * hour],
        [6, 8 * hour],
      ]),
    ),
    [5, 6],
  );
  assert.deepEqual(
    changePointPartitionLengths(
      uniqueFileSets,
      new Map([
        [5, 4 * hour],
        [6, 8 * hour],
      ]),
    ),
    [6, 5],
  );
  assert.deepEqual(
    splitAtChangePoint(
      changePointCommits(
        uniqueFileSets,
        new Map([
          [5, 4 * hour],
          [6, 4 * hour],
        ]),
      ),
    ).map((partition) => partition.length),
    [5, 6],
  );

  const recursiveFileSets = Array.from({ length: 6 }, (_, group) =>
    Array.from({ length: 5 }, () => [`group-${group}-a.ts`, `group-${group}-b.ts`, `group-${group}-c.ts`]),
  ).flat();
  const recursivePartitions = splitAtChangePoint(
    changePointCommits(
      recursiveFileSets,
      new Map([
        [5, 4 * hour],
        [10, 4 * hour],
        [15, 8 * hour],
        [20, 4 * hour],
        [25, 4 * hour],
      ]),
    ),
  );

  assert.deepEqual(
    recursivePartitions.map((partition) => partition.map((commit) => commit.hash)),
    Array.from({ length: 6 }, (_, group) => Array.from({ length: 5 }, (_, offset) => `point-${group * 5 + offset}`)),
  );
});
