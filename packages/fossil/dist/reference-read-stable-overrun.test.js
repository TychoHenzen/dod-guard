import assert from "node:assert/strict";
import { test } from "node:test";
import { readStableReferenceSourcesInternal } from "./reference-read-stable.js";
test("warns when a stable read returns more bytes than allowed", () => {
    const result = readStableReferenceSourcesInternal({
        sources: [{ path: "src/oversized-after-read.ts", language: "typescript" }],
        maximumFileBytes: 4,
        maximumTotalBytes: 4,
        boundary: {
            inspect: () => ({
                identity: "oversized-after-read",
                isRegularFile: true,
                byteLength: 2,
                canonicalPath: "C:/repo/src/oversized-after-read.ts",
            }),
            read: () => ({ content: "ok", byteLength: 5 }),
        },
    });
    assert.deepEqual(result.sources, []);
    assert.deepEqual(result.graph.unavailablePaths, [
        "src/oversized-after-read.ts",
    ]);
    assert.deepEqual(result.warnings, [
        {
            code: "reference_content_limit",
            message: "Reference source exceeds the bounded read limit.",
            path: "src/oversized-after-read.ts",
        },
    ]);
});
//# sourceMappingURL=reference-read-stable-overrun.test.js.map