import assert from "node:assert/strict";
import { test } from "node:test";
import { selectAbsoluteSurvivors, selectRelativeSurvivors, selectSurvivors, } from "./git-analyzer.js";
import { maximumFileActivity } from "./git-analyzer.test-support.js";
test("selects only files with at least three post-burst commits", () => {
    const files = [
        {
            identity: "survives",
            path: "survives.ts",
            burstCommits: 2,
            postBurstCommits: 3,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "quiet",
            path: "quiet.ts",
            burstCommits: 2,
            postBurstCommits: 2,
            createdInBurst: true,
            existsAtHead: true,
        },
    ];
    assert.deepEqual(selectAbsoluteSurvivors(files), [files[0]]);
    assert.equal(files[1].postBurstCommits, 2);
});
test("selects positive relative survivors inclusively with absolute survivors", () => {
    const files = [
        {
            identity: "absolute",
            path: "absolute.ts",
            burstCommits: 1,
            postBurstCommits: 3,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "at-threshold",
            path: "at-threshold.ts",
            burstCommits: 1,
            postBurstCommits: 20,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "below-threshold",
            path: "below-threshold.ts",
            burstCommits: 1,
            postBurstCommits: 2,
            createdInBurst: true,
            existsAtHead: true,
        },
        maximumFileActivity,
    ];
    assert.deepEqual(selectRelativeSurvivors(files), [files[1], files[3]]);
    assert.deepEqual(selectSurvivors(files), [files[0], files[1], files[3]]);
});
test("does not select relative survivors when every post-burst count is zero", () => {
    const files = [
        {
            identity: "first",
            path: "first.ts",
            burstCommits: 2,
            postBurstCommits: 0,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "second",
            path: "second.ts",
            burstCommits: 1,
            postBurstCommits: 0,
            createdInBurst: false,
            existsAtHead: true,
        },
    ];
    assert.deepEqual(selectRelativeSurvivors(files), []);
    assert.deepEqual(selectSurvivors(files), []);
});
//# sourceMappingURL=git-history-survivors-a.cases.js.map