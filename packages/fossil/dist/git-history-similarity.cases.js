import assert from "node:assert/strict";
import { test } from "node:test";
import { splitAtChangePoint } from "./git-analyzer.js";
import "./git-history-similarity-small.cases.js";
test("splits close disjoint work when inverse-frequency weighting suppresses " +
    "the shared file", () => {
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
        changes: changedPaths.map((path) => ({
            status: "modified",
            path,
        })),
    }));
    const leftFiles = new Set(commits
        .slice(0, 5)
        .flatMap((commit) => commit.changes.map((change) => change.path)));
    const rightFiles = new Set(commits
        .slice(5)
        .flatMap((commit) => commit.changes.map((change) => change.path)));
    const unweightedSimilarity = [...leftFiles].filter((path) => rightFiles.has(path)).length /
        new Set([...leftFiles, ...rightFiles]).size;
    assert.equal(unweightedSimilarity, 1 / 7);
    assert.ok(unweightedSimilarity > 0.1);
    const partitions = splitAtChangePoint(commits);
    assert.deepEqual(partitions.map((partition) => partition.map((commit) => commit.hash)), [
        ["0", "1", "2", "3", "4"],
        ["5", "6", "7", "8", "9"],
    ]);
});
//# sourceMappingURL=git-history-similarity.cases.js.map