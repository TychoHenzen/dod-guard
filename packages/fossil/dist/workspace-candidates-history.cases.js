import assert from "node:assert/strict";
import { test } from "node:test";
import * as workspace from "./workspace-debris.js";
test("parses NUL-delimited untracked paths and selects an old regular file", () => {
    const unusualPath = "scratch/line\nbreak.ts";
    assert.deepEqual(workspace.UNTRACKED_DISCOVERY_ARGUMENTS, [
        "ls-files",
        "-z",
        "--others",
        "--exclude-standard",
    ]);
    assert.deepEqual(workspace.parseNulDelimitedPaths(`scratch/old.ts\0${unusualPath}\0`), ["scratch/old.ts", unusualPath]);
    const candidates = workspace.oldUntrackedWorkspaceCandidates([
        { path: "scratch/old.ts", isRegularFile: true, modifiedTimestampMs: 0 },
        {
            path: "scratch/directory",
            isRegularFile: false,
            modifiedTimestampMs: 0,
        },
    ], 10 * 24 * 60 * 60 * 1_000, 7);
    assert.deepEqual(candidates, [
        { path: "scratch/old.ts", kind: "untracked", modifiedTimestampMs: 0 },
    ]);
});
test("retains NUL-delimited ignore rule provenance for an old ignored regular " +
    "file", () => {
    assert.deepEqual(workspace.IGNORED_DISCOVERY_ARGUMENTS, [
        "ls-files",
        "-z",
        "--others",
        "--ignored",
        "--exclude-standard",
    ]);
    assert.deepEqual(workspace.CHECK_IGNORE_ARGUMENTS, [
        "check-ignore",
        "-z",
        "-v",
        "--stdin",
    ]);
    const provenance = workspace.parseVerboseCheckIgnore(".gitignore\0" +
        "4\0" +
        "*.cache\0" +
        "scratch/old.cache\0" +
        "C:/global/excludes\0" +
        "1\0" +
        "*.tmp\0" +
        "scratch/global.tmp\0", "C:/global/excludes");
    assert.deepEqual(provenance, [
        { path: "scratch/old.cache", rule: "*.cache", source: "repository" },
        {
            path: "scratch/global.tmp",
            rule: "*.tmp",
            source: "global-exclude",
        },
    ]);
    const candidates = workspace.oldIgnoredWorkspaceCandidates({
        files: [
            {
                path: "scratch/old.cache",
                isRegularFile: true,
                modifiedTimestampMs: 0,
            },
        ],
        provenance,
        analysisTimestampMs: 10 * 24 * 60 * 60 * 1_000,
        minimumAgeDays: 7,
    });
    assert.deepEqual(candidates, [
        {
            path: "scratch/old.cache",
            kind: "ignored",
            modifiedTimestampMs: 0,
            ignore: { rule: "*.cache", source: "repository" },
        },
    ]);
});
//# sourceMappingURL=workspace-candidates-history.cases.js.map