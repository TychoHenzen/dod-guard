import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectWorkspaceFileMetadata, oldIgnoredWorkspaceCandidates, } from "./workspace-debris.js";
test("excludes dependency-store paths", () => {
    const metadataReads = [];
    const metadata = inspectWorkspaceFileMetadata(["node_modules/old.cache", "scratch\\old.cache"], (path) => {
        metadataReads.push(path);
        return { path, isRegularFile: true, modifiedTimestampMs: 0 };
    });
    assert.deepEqual(metadataReads, ["scratch/old.cache"]);
    assert.deepEqual(oldIgnoredWorkspaceCandidates({
        files: metadata,
        provenance: [
            {
                path: "node_modules/old.cache",
                rule: "*.cache",
                source: "repository",
            },
            { path: "scratch/old.cache", rule: "*.cache", source: "repository" },
        ],
        analysisTimestampMs: 10 * 24 * 60 * 60 * 1_000,
        minimumAgeDays: 7,
    }), [
        {
            path: "scratch/old.cache",
            kind: "ignored",
            modifiedTimestampMs: 0,
            ignore: { rule: "*.cache", source: "repository" },
        },
    ]);
});
test("excludes sensitive paths before metadata reads", () => {
    const metadataReads = [];
    const metadata = inspectWorkspaceFileMetadata([
        "config/.ENV.Production",
        "certs/Client.PEM",
        "secrets/CredentialsBackup",
        ".AwS\\config",
        "scratch/allowed.ts",
    ], (path) => {
        metadataReads.push(path);
        return { path, isRegularFile: true, modifiedTimestampMs: 0 };
    });
    assert.deepEqual(metadataReads, ["scratch/allowed.ts"]);
    assert.deepEqual(metadata, [
        { path: "scratch/allowed.ts", isRegularFile: true, modifiedTimestampMs: 0 },
    ]);
});
test("drops symlink and junction metadata without inspecting targets", () => {
    const metadataReads = [];
    const metadata = inspectWorkspaceFileMetadata(["scratch/external-link", "scratch/junction", "scratch/regular.ts"], (path) => {
        metadataReads.push(path);
        return {
            path,
            isRegularFile: path === "scratch/regular.ts",
            isSymbolicLink: path === "scratch/external-link",
            isJunction: path === "scratch/junction",
            modifiedTimestampMs: 0,
        };
    });
    assert.deepEqual(metadataReads, [
        "scratch/external-link",
        "scratch/junction",
        "scratch/regular.ts",
    ]);
    assert.deepEqual(metadata, [
        {
            path: "scratch/regular.ts",
            isRegularFile: true,
            isSymbolicLink: false,
            isJunction: false,
            modifiedTimestampMs: 0,
        },
    ]);
});
//# sourceMappingURL=workspace-security.cases.js.map