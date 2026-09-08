import assert from "node:assert/strict";
import { test } from "node:test";
import { readStableReferenceSources } from "./ref-analyzer.js";
import { runStableRaceScenario } from "./ref-stable-races-fixture.js";
const scenario = runStableRaceScenario();
test("keeps only stable source reads and records scan races as unavailable " +
    "evidence", () => {
    const { result, contentReads, inspectionReads } = scenario;
    assert.deepEqual(result.sources.map((source) => source.path), ["src/stable.ts"]);
    assert.deepEqual(contentReads, [
        "src/stable.ts",
        "src/binary.ts",
        "src/read-failure.ts",
    ]);
    assert.deepEqual(inspectionReads, scenario.sources.flatMap((source) => [source.path, source.path]));
    assert.equal(result.acceptedBytes, 7);
});
test("records only stable-read diagnostics and does not expose sensitive " +
    "details", () => {
    const { result } = scenario;
    assert.deepEqual(result.graph.unavailablePaths, [
        "src/binary.ts",
        "src/canonical.ts",
        "src/disappeared.ts",
        "src/identity.ts",
        "src/read-failure.ts",
        "src/size.ts",
        "src/type.ts",
    ]);
    assert.deepEqual(result.warnings.map(({ code, path }) => ({ code, path })), [
        { code: "reference_binary", path: "src/binary.ts" },
        { code: "reference_path_changed", path: "src/canonical.ts" },
        { code: "reference_unreadable", path: "src/disappeared.ts" },
        { code: "reference_path_changed", path: "src/identity.ts" },
        { code: "reference_unreadable", path: "src/read-failure.ts" },
        { code: "reference_path_changed", path: "src/size.ts" },
        { code: "reference_path_changed", path: "src/type.ts" },
    ]);
    assert.equal(JSON.stringify(result.warnings).includes("C:/private/outside.ts"), false);
    assert.equal(JSON.stringify(result.warnings).includes("sensitive filesystem error"), false);
});
test("charges the bytes returned by a bounded stable read", () => {
    const maximumReads = [];
    const result = readStableReferenceSources({
        sources: [{ path: "src/short.ts", language: "typescript" }],
        maximumFileBytes: 10,
        maximumTotalBytes: 10,
        boundary: {
            inspect: () => ({
                identity: "short",
                isRegularFile: true,
                byteLength: 4,
                canonicalPath: "C:/repo/src/short.ts",
            }),
            read: (_source, maximumBytes) => {
                maximumReads.push(maximumBytes);
                return "ok";
            },
        },
    });
    assert.deepEqual(maximumReads, [10]);
    assert.equal(result.acceptedBytes, 2);
});
//# sourceMappingURL=ref-stable-races.cases.js.map