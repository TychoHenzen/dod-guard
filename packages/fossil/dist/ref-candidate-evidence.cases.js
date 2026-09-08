import assert from "node:assert/strict";
import { test } from "node:test";
import { markUnresolvedCandidateEvidence, regradeVestigialEdges, } from "./ref-analyzer.js";
import "./ref-candidate-strength.cases.js";
test("regrades only candidate-to-candidate edges without mutating the graph", () => {
    const graph = {
        edges: [
            {
                sourcePath: "a.ts",
                targetPath: "b.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 0, end: 1, line: 1, column: 1 },
            },
            {
                sourcePath: "live.ts",
                targetPath: "a.ts",
                language: "typescript",
                kind: "import",
                strength: "weak",
                span: { start: 2, end: 3, line: 1, column: 3 },
            },
            {
                sourcePath: "a.ts",
                targetPath: "live.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 4, end: 5, line: 1, column: 5 },
            },
        ],
        unresolved: [],
        complete: true,
        unavailablePaths: [],
    };
    const result = regradeVestigialEdges(graph, new Set(["a.ts", "b.ts"]));
    assert.deepEqual(result.edges.map((edge) => edge.strength), ["vestigial", "weak", "strong"]);
    assert.equal(graph.edges[0].strength, "strong");
});
test("marks only tail or uniquely named unresolved candidate paths unavailable", () => {
    const graph = {
        edges: [],
        unresolved: [
            {
                sourcePath: "live.ts",
                targetCandidates: ["lib/tail", "unique", "shared", "tail", ""],
                language: "typescript",
                kind: "import",
                span: { start: 0, end: 1, line: 1, column: 1 },
                resolution: "unresolved",
            },
            {
                sourcePath: "live.ts",
                targetCandidates: ["package"],
                language: "typescript",
                kind: "import",
                span: { start: 2, end: 3, line: 1, column: 3 },
                resolution: "external",
            },
        ],
        complete: false,
        unavailablePaths: ["existing.ts"],
    };
    const result = markUnresolvedCandidateEvidence(graph, new Set([
        "src/lib/tail.ts",
        "src/unique.ts",
        "a/shared.ts",
        "b/shared.ts",
        "src/retail.ts",
        "src/package.ts",
    ]));
    assert.deepEqual(result.unavailablePaths, [
        "existing.ts",
        "src/lib/tail.ts",
        "src/unique.ts",
    ]);
    assert.equal(result.complete, false);
    assert.deepEqual(graph.unavailablePaths, ["existing.ts"]);
});
//# sourceMappingURL=ref-candidate-evidence.cases.js.map