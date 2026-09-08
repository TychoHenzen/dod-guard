import assert from "node:assert/strict";
import { test } from "node:test";
import { splitAtChangePoint } from "./git-analyzer.js";
test("keeps close low-similarity work together when a side is too small", () => {
    const hour = 60 * 60 * 1_000;
    const fourCommitPartition = [
        "left-a.ts",
        "left-b.ts",
        "left-c.ts",
        "left-a.ts",
    ];
    const fiveCommitPartition = [
        "right-a.ts",
        "right-b.ts",
        "right-c.ts",
        "right-a.ts",
        "right-b.ts",
    ];
    const fewerThanFiveCommits = [
        ...fourCommitPartition,
        ...fiveCommitPartition,
    ].map((path, index) => ({
        hash: `commit-${index}`,
        committerTimestampMs: index < 4 ? index * hour : (index + 3) * hour,
        changes: [{ status: "modified", path }],
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
        changes: [{ status: "modified", path }],
    }));
    assert.deepEqual(splitAtChangePoint(fewerThanFiveCommits), [
        fewerThanFiveCommits,
    ]);
    assert.deepEqual(splitAtChangePoint(fewerThanThreeFiles), [
        fewerThanThreeFiles,
    ]);
});
//# sourceMappingURL=git-history-similarity-small.cases.js.map