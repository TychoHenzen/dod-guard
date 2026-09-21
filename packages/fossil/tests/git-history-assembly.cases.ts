import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleClosedBursts } from "../src/git-analyzer.js";
import { HOUR, burstGroup } from "./git-history-assembly.fixture.js";

test("assembles final burst activity", () => {
  const temporalCluster = [
    ...burstGroup("first", 0),
    ...burstGroup("second", 8 * HOUR),
    ...burstGroup("third", 16 * HOUR),
  ];
  const fullHistory = [
    ...temporalCluster,
    {
      hash: "after-first",
      committerTimestampMs: 30 * HOUR,
      changes: [{ status: "modified" as const, path: "first-a.ts" }],
    },
  ];

  const bursts = assembleClosedBursts(fullHistory, [temporalCluster]);

  assert.deepEqual(
    bursts.map((burst) => ({
      id: burst.id,
      start: burst.startTimestampMs,
      end: burst.endTimestampMs,
      commits: burst.commits.map((commit) => commit.hash),
      files: burst.files.map((file) => [
        file.path,
        file.burstCommits,
        file.postBurstCommits,
        file.createdInBurst,
      ]),
    })),
    [
      {
        id: "burst-first-a-first-e",
        start: 0,
        end: 4 * HOUR,
        commits: ["first-a", "first-b", "first-c", "first-d", "first-e"],
        files: [
          ["first-a.ts", 2, 1, true],
          ["first-b.ts", 2, 0, true],
          ["first-c.ts", 1, 0, true],
        ],
      },
      {
        id: "burst-second-a-second-e",
        start: 8 * HOUR,
        end: 12 * HOUR,
        commits: ["second-a", "second-b", "second-c", "second-d", "second-e"],
        files: [
          ["second-a.ts", 2, 0, true],
          ["second-b.ts", 2, 0, true],
          ["second-c.ts", 1, 0, true],
        ],
      },
      {
        id: "burst-third-a-third-e",
        start: 16 * HOUR,
        end: 20 * HOUR,
        commits: ["third-a", "third-b", "third-c", "third-d", "third-e"],
        files: [
          ["third-a.ts", 2, 0, true],
          ["third-b.ts", 2, 0, true],
          ["third-c.ts", 1, 0, true],
        ],
      },
    ],
  );
  assert.ok(bursts.every((burst) => burst.closed));
});
