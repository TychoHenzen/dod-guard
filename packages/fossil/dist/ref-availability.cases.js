import assert from "node:assert/strict";
import { test } from "node:test";
import { readReferenceSources, unsupportedCandidateReferenceGraph, } from "./ref-analyzer.js";
test("marks unsupported candidate references unavailable without producing " +
    "edges", () => {
    const candidates = [
        { path: "src/candidate.lua", language: "unsupported" },
        { path: "src/live.ts", language: "typescript" },
    ];
    assert.doesNotThrow(() => unsupportedCandidateReferenceGraph(candidates));
    const graph = unsupportedCandidateReferenceGraph(candidates);
    assert.deepEqual(graph, {
        edges: [],
        unresolved: [],
        complete: false,
        unavailablePaths: ["src/candidate.lua"],
    });
});
test("continues after an unreadable source without exposing its read error", () => {
    const attemptedPaths = [];
    const sources = [
        { path: "src/candidate.ts", language: "typescript" },
        { path: "src/live.ts", language: "typescript" },
    ];
    const readSource = (source) => {
        attemptedPaths.push(source.path);
        if (source.path === "src/candidate.ts")
            throw new Error("sensitive filesystem error");
        return "export const live = true;\n";
    };
    const result = readReferenceSources(sources, readSource);
    assert.deepEqual(attemptedPaths, ["src/candidate.ts", "src/live.ts"]);
    assert.deepEqual(result.sources, [
        {
            path: "src/live.ts",
            language: "typescript",
            content: "export const live = true;\n",
        },
    ]);
    assert.deepEqual(result.graph, {
        edges: [],
        unresolved: [],
        complete: false,
        unavailablePaths: ["src/candidate.ts"],
    });
    assert.deepEqual(result.warnings, [
        {
            code: "reference_unreadable",
            message: "Reference source could not be read.",
            path: "src/candidate.ts",
        },
    ]);
});
//# sourceMappingURL=ref-availability.cases.js.map