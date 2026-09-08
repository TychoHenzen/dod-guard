import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleClosedBursts } from "./git-analyzer.js";
test("builds final burst activity from recursive close-split partitions", () => {
    const hour = 60 * 60 * 1_000;
    const group = (name, start) => [
        { hash: `${name}-a`, committerTimestampMs: start, changes: [{ status: "added", path: `${name}-a.ts` }] },
        {
            hash: `${name}-b`,
            committerTimestampMs: start + hour,
            changes: [{ status: "added", path: `${name}-b.ts` }],
        },
        {
            hash: `${name}-c`,
            committerTimestampMs: start + 2 * hour,
            changes: [{ status: "added", path: `${name}-c.ts` }],
        },
        {
            hash: `${name}-d`,
            committerTimestampMs: start + 3 * hour,
            changes: [{ status: "modified", path: `${name}-a.ts` }],
        },
        {
            hash: `${name}-e`,
            committerTimestampMs: start + 4 * hour,
            changes: [{ status: "modified", path: `${name}-b.ts` }],
        },
    ];
    const temporalCluster = [...group("first", 0), ...group("second", 8 * hour), ...group("third", 16 * hour)];
    const fullHistory = [
        ...temporalCluster,
        {
            hash: "after-first",
            committerTimestampMs: 30 * hour,
            changes: [{ status: "modified", path: "first-a.ts" }],
        },
    ];
    const bursts = assembleClosedBursts(fullHistory, [temporalCluster]);
    assert.deepEqual(bursts.map((burst) => ({
        id: burst.id,
        start: burst.startTimestampMs,
        end: burst.endTimestampMs,
        commits: burst.commits.map((commit) => commit.hash),
        files: burst.files.map((file) => [file.path, file.burstCommits, file.postBurstCommits, file.createdInBurst]),
    })), [
        {
            id: "burst-first-a-first-e",
            start: 0,
            end: 4 * hour,
            commits: ["first-a", "first-b", "first-c", "first-d", "first-e"],
            files: [
                ["first-a.ts", 2, 1, true],
                ["first-b.ts", 2, 0, true],
                ["first-c.ts", 1, 0, true],
            ],
        },
        {
            id: "burst-second-a-second-e",
            start: 8 * hour,
            end: 12 * hour,
            commits: ["second-a", "second-b", "second-c", "second-d", "second-e"],
            files: [
                ["second-a.ts", 2, 0, true],
                ["second-b.ts", 2, 0, true],
                ["second-c.ts", 1, 0, true],
            ],
        },
        {
            id: "burst-third-a-third-e",
            start: 16 * hour,
            end: 20 * hour,
            commits: ["third-a", "third-b", "third-c", "third-d", "third-e"],
            files: [
                ["third-a.ts", 2, 0, true],
                ["third-b.ts", 2, 0, true],
                ["third-c.ts", 1, 0, true],
            ],
        },
    ]);
    assert.ok(bursts.every((burst) => burst.closed));
});
//# sourceMappingURL=git-history-assembly.cases.js.map