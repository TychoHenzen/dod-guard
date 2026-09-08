import assert from "node:assert/strict";
import { test } from "node:test";
import { readBoundedReferenceSources } from "./ref-analyzer.js";
test("stops all later source reads when the total content budget is reached or exceeded", () => {
    const exactMetadataReads = [];
    const exactContentReads = [];
    const exactLimit = readBoundedReferenceSources([
        { path: "src/exact.ts", language: "typescript" },
        { path: "src/after-exact.ts", language: "typescript" },
    ], (source) => {
        exactMetadataReads.push(source.path);
        return { byteLength: source.path === "src/exact.ts" ? 10 : 1 };
    }, (source) => {
        exactContentReads.push(source.path);
        return "content";
    }, 10, 10);
    assert.deepEqual(exactMetadataReads, ["src/exact.ts"]);
    assert.deepEqual(exactContentReads, ["src/exact.ts"]);
    assert.equal(exactLimit.acceptedBytes, 10);
    assert.deepEqual(exactLimit.graph.unavailablePaths, ["src/after-exact.ts"]);
    const metadataReads = [];
    const contentReads = [];
    const exceededLimit = readBoundedReferenceSources([
        { path: "src/accepted.ts", language: "typescript" },
        { path: "src/exceeds.ts", language: "typescript" },
        { path: "src/smaller-later.ts", language: "typescript" },
    ], (source) => {
        metadataReads.push(source.path);
        return { byteLength: source.path === "src/accepted.ts" ? 6 : source.path === "src/exceeds.ts" ? 5 : 1 };
    }, (source) => {
        contentReads.push(source.path);
        return "content";
    }, 10, 10);
    assert.deepEqual(metadataReads, ["src/accepted.ts", "src/exceeds.ts"]);
    assert.deepEqual(contentReads, ["src/accepted.ts"]);
    assert.equal(exceededLimit.acceptedBytes, 6);
    assert.deepEqual(exceededLimit.graph, {
        edges: [],
        unresolved: [],
        complete: false,
        unavailablePaths: ["src/exceeds.ts", "src/smaller-later.ts"],
    });
    assert.deepEqual(exceededLimit.warnings.map(({ code, path }) => ({ code, path })), [
        { code: "reference_content_limit", path: "src/exceeds.ts" },
        { code: "reference_content_limit", path: "src/smaller-later.ts" },
    ]);
});
//# sourceMappingURL=ref-bounded-b.cases.js.map