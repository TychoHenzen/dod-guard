import assert from "node:assert/strict";
import { test } from "node:test";
import { oldUntrackedWorkspaceCandidates, } from "./workspace-debris.js";
import "./workspace-candidates-boundary.cases.js";
test("uses one captured time for immediately adjacent modification-age " +
    "boundaries", () => {
    const analysisTimestampMs = 10 * 24 * 60 * 60 * 1_000;
    const cutoff = analysisTimestampMs - 7 * 24 * 60 * 60 * 1_000;
    const candidates = oldUntrackedWorkspaceCandidates([
        {
            path: "scratch/before.ts",
            isRegularFile: true,
            modifiedTimestampMs: cutoff - 1,
        },
        {
            path: "scratch/at.ts",
            isRegularFile: true,
            modifiedTimestampMs: cutoff,
        },
        {
            path: "scratch/after.ts",
            isRegularFile: true,
            modifiedTimestampMs: cutoff + 1,
        },
    ], analysisTimestampMs, 7);
    assert.deepEqual(candidates, [
        {
            path: "scratch/before.ts",
            kind: "untracked",
            modifiedTimestampMs: cutoff - 1,
        },
        { path: "scratch/at.ts", kind: "untracked", modifiedTimestampMs: cutoff },
    ]);
});
//# sourceMappingURL=workspace-candidates-b.cases.js.map