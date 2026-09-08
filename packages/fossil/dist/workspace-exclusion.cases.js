import assert from "node:assert/strict";
import { test } from "node:test";
import { filterWorkspaceDiscoveryPaths, inspectWorkspaceFileMetadataWithWarnings, } from "./workspace-debris.js";
test("filters caller-excluded paths before metadata reads, warnings, and ignore " +
    "provenance input", () => {
    const discoveredPaths = filterWorkspaceDiscoveryPaths(["ignored\\hidden.cache", "scratch/allowed.ts"], ["ignored/**", "[malformed", "x".repeat(257)]);
    const metadataReads = [];
    const result = inspectWorkspaceFileMetadataWithWarnings(["ignored\\hidden.cache", "scratch/allowed.ts"], (path) => {
        metadataReads.push(path);
        return { path, isRegularFile: true, modifiedTimestampMs: 0 };
    }, ["ignored/**"]);
    assert.deepEqual(discoveredPaths, ["scratch/allowed.ts"]);
    assert.deepEqual(filterWorkspaceDiscoveryPaths(["ignored/nested/file.ts"], [`ignored/${"*".repeat(80)}`]), []);
    assert.deepEqual(filterWorkspaceDiscoveryPaths(["ignored/limit.ts"], [
        ...Array.from({ length: 64 }, (_, index) => `nonmatching-${index}`),
        "ignored/**",
    ]), ["ignored/limit.ts"]);
    assert.deepEqual(metadataReads, ["scratch/allowed.ts"]);
    assert.deepEqual(result.warnings, []);
    assert.equal(discoveredPaths.includes("ignored/hidden.cache"), false);
    assert.deepEqual(filterWorkspaceDiscoveryPaths(["src/a.ts", "src/ab.ts", "src/nested/a.ts"], ["src/?.ts"]), ["src/ab.ts", "src/nested/a.ts"]);
});
//# sourceMappingURL=workspace-exclusion.cases.js.map