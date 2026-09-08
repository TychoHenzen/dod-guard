import assert from "node:assert/strict";
import { test } from "node:test";
import { readStableReferenceSources } from "./ref-analyzer.js";
test("keeps a directory symlink candidate unavailable without reading its content", () => {
    const contentReads = [];
    const result = readStableReferenceSources({
        sources: [
            { path: "src/ordinary.ts", language: "typescript" },
            { path: "src/directory-link.ts", language: "typescript" },
        ],
        boundary: {
            inspect: (source) => ({
                identity: source.path,
                isRegularFile: source.path !== "src/directory-link.ts",
                byteLength: 7,
                canonicalPath: `C:/repo/${source.path}`,
            }),
            read: (source) => {
                contentReads.push(source.path);
                return "content";
            },
        },
    });
    assert.deepEqual(contentReads, ["src/ordinary.ts"]);
    assert.deepEqual(result.sources, [{ path: "src/ordinary.ts", language: "typescript", content: "content" }]);
    assert.deepEqual(result.graph.unavailablePaths, ["src/directory-link.ts"]);
    assert.deepEqual(result.warnings, [
        {
            code: "reference_unreadable",
            message: "Reference source could not be read.",
            path: "src/directory-link.ts",
        },
    ]);
});
//# sourceMappingURL=ref-stable-symlink.cases.js.map