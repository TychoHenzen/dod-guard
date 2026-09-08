import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRenameActivities } from "./git-analyzer.js";
test("keeps copied and recreated paths in separate logical generations", () => {
    const activities = resolveRenameActivities([
        {
            hash: "create-source",
            committerTimestampMs: 1_000,
            changes: [{ status: "added", path: "src/source.ts" }],
        },
        {
            hash: "copy-source",
            committerTimestampMs: 2_000,
            changes: [
                {
                    status: "copied",
                    previousPath: "src/source.ts",
                    path: "src/copy.ts",
                },
            ],
        },
        {
            hash: "modify-source",
            committerTimestampMs: 3_000,
            changes: [{ status: "modified", path: "src/source.ts" }],
        },
        {
            hash: "create-recreated",
            committerTimestampMs: 4_000,
            changes: [{ status: "added", path: "src/recreated.ts" }],
        },
        {
            hash: "delete-recreated",
            committerTimestampMs: 5_000,
            changes: [{ status: "deleted", path: "src/recreated.ts" }],
        },
        {
            hash: "recreate",
            committerTimestampMs: 6_000,
            changes: [{ status: "added", path: "src/recreated.ts" }],
        },
    ]);
    const source = activities.find((activity) => activity.identity === "src/source.ts");
    const copy = activities.find((activity) => activity.identity === "src/copy.ts");
    const recreations = activities.filter((activity) => activity.paths[0] === "src/recreated.ts");
    assert.deepEqual(source, {
        identity: "src/source.ts",
        currentPath: "src/source.ts",
        paths: ["src/source.ts"],
        firstCommitTimestampMs: 1_000,
        lastCommitTimestampMs: 3_000,
        commitCount: 2,
        created: true,
        deleted: false,
        existsAtHead: true,
    });
    assert.deepEqual(copy, {
        identity: "src/copy.ts",
        currentPath: "src/copy.ts",
        paths: ["src/copy.ts"],
        firstCommitTimestampMs: 2_000,
        lastCommitTimestampMs: 2_000,
        commitCount: 1,
        created: true,
        deleted: false,
        existsAtHead: true,
    });
    assert.equal(recreations.length, 2);
    assert.notEqual(recreations[0].identity, recreations[1].identity);
    assert.equal(recreations[0].currentPath, undefined);
    assert.equal(recreations[0].deleted, true);
    assert.equal(recreations[1].currentPath, "src/recreated.ts");
    assert.equal(recreations[1].existsAtHead, true);
});
//# sourceMappingURL=git-history-copy-recreate.cases.js.map