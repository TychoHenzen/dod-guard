import assert from "node:assert/strict";
import { test } from "node:test";
import { readStableReferenceSources, } from "./ref-analyzer.js";
test("keeps only stable source reads and records scan races as unavailable evidence", () => {
    const snapshot = (identity, isRegularFile = true, canonicalPath = `C:/repo/${identity}`, byteLength = 7) => ({
        identity,
        isRegularFile,
        byteLength,
        canonicalPath,
    });
    const sources = [
        { path: "src/stable.ts", language: "typescript" },
        { path: "src/disappeared.ts", language: "typescript" },
        { path: "src/type.ts", language: "typescript" },
        { path: "src/identity.ts", language: "typescript" },
        { path: "src/canonical.ts", language: "typescript" },
        { path: "src/size.ts", language: "typescript" },
        { path: "src/binary.ts", language: "typescript" },
        { path: "src/read-failure.ts", language: "typescript" },
    ];
    const inspections = new Map(sources.map((source) => [source.path, [snapshot(source.path), snapshot(source.path)]]));
    inspections.set("src/disappeared.ts", [snapshot("src/disappeared.ts"), undefined]);
    inspections.set("src/type.ts", [snapshot("src/type.ts"), snapshot("src/type.ts", false)]);
    inspections.set("src/identity.ts", [snapshot("old"), snapshot("new")]);
    inspections.set("src/canonical.ts", [snapshot("same"), snapshot("same", true, "C:/private/outside.ts")]);
    inspections.set("src/size.ts", [snapshot("same"), snapshot("same", true, "C:/repo/same", 8)]);
    const inspectionReads = [];
    const contentReads = [];
    const result = readStableReferenceSources(sources, {
        inspect: (source) => {
            inspectionReads.push(source.path);
            return inspections.get(source.path)?.shift();
        },
        read: (source) => {
            contentReads.push(source.path);
            if (source.path === "src/read-failure.ts")
                throw new Error("sensitive filesystem error");
            if (source.path === "src/binary.ts")
                return "text\0not-source";
            return `// ${source.path}\n`;
        },
    });
    assert.deepEqual(result.sources.map((source) => source.path), ["src/stable.ts"]);
    assert.deepEqual(contentReads, ["src/stable.ts", "src/binary.ts", "src/read-failure.ts"]);
    assert.deepEqual(inspectionReads, sources.flatMap((source) => [source.path, source.path]));
    assert.equal(result.acceptedBytes, 7);
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
//# sourceMappingURL=ref-stable-races.cases.js.map