import assert from "node:assert/strict";
import { test } from "node:test";
import { oldIgnoredWorkspaceCandidates, oldUntrackedWorkspaceCandidates, } from "./workspace-debris.js";
test("omits recent untracked and ignored workspace files", () => {
    const now = 10 * 24 * 60 * 60 * 1_000;
    const recentTimestampMs = now - 24 * 60 * 60 * 1_000;
    assert.deepEqual(oldUntrackedWorkspaceCandidates([
        {
            path: "scratch/recent.ts",
            isRegularFile: true,
            modifiedTimestampMs: recentTimestampMs,
        },
    ], now, 7), []);
    assert.deepEqual(oldIgnoredWorkspaceCandidates({
        files: [
            {
                path: "scratch/recent.cache",
                isRegularFile: true,
                modifiedTimestampMs: recentTimestampMs,
            },
        ],
        provenance: [
            { path: "scratch/recent.cache", rule: "*.cache", source: "repository" },
        ],
        analysisTimestampMs: now,
        minimumAgeDays: 7,
    }), []);
});
//# sourceMappingURL=workspace-candidates-a.cases.js.map