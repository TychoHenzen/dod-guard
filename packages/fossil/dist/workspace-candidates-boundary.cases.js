import assert from "node:assert/strict";
import { test } from "node:test";
import { oldIgnoredWorkspaceCandidates, oldUntrackedWorkspaceCandidates, } from "./workspace-debris.js";
test("uses old modification time when creation metadata is unavailable", () => {
    const now = 10 * 24 * 60 * 60 * 1_000;
    const candidates = oldUntrackedWorkspaceCandidates([
        {
            path: "scratch/old-without-birth.ts",
            isRegularFile: true,
            modifiedTimestampMs: 0,
        },
    ], now, 7);
    assert.deepEqual(candidates, [
        {
            path: "scratch/old-without-birth.ts",
            kind: "untracked",
            modifiedTimestampMs: 0,
        },
    ]);
});
test("includes untracked and ignored files exactly on the modification-age " +
    "cutoff", () => {
    const now = 10 * 24 * 60 * 60 * 1_000;
    const cutoff = now - 7 * 24 * 60 * 60 * 1_000;
    assert.deepEqual(oldUntrackedWorkspaceCandidates([
        {
            path: "scratch/cutoff.ts",
            isRegularFile: true,
            modifiedTimestampMs: cutoff,
        },
    ], now, 7), [
        {
            path: "scratch/cutoff.ts",
            kind: "untracked",
            modifiedTimestampMs: cutoff,
        },
    ]);
    assert.deepEqual(oldIgnoredWorkspaceCandidates({
        files: [
            {
                path: "scratch/cutoff.cache",
                isRegularFile: true,
                modifiedTimestampMs: cutoff,
            },
        ],
        provenance: [
            {
                path: "scratch/cutoff.cache",
                rule: "*.cache",
                source: "repository",
            },
        ],
        analysisTimestampMs: now,
        minimumAgeDays: 7,
    }), [
        {
            path: "scratch/cutoff.cache",
            kind: "ignored",
            modifiedTimestampMs: cutoff,
            ignore: { rule: "*.cache", source: "repository" },
        },
    ]);
});
//# sourceMappingURL=workspace-candidates-boundary.cases.js.map