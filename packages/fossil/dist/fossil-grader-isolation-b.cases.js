import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterIsolationScore, } from "./fossil-grader.js";
test("gives zero isolation when every unique resolved " + "neighbor is live code", () => {
    const graph = {
        edges: [
            {
                sourcePath: "src/live-inbound.ts",
                targetPath: "src/candidate.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 0, end: 1, line: 1, column: 1 },
            },
            {
                sourcePath: "src/candidate.ts",
                targetPath: "src/live-outbound.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 1, end: 2, line: 1, column: 2 },
            },
            {
                sourcePath: "src/live-outbound.ts",
                targetPath: "src/candidate.ts",
                language: "typescript",
                kind: "require",
                strength: "strong",
                span: { start: 2, end: 3, line: 1, column: 3 },
            },
        ],
        unresolved: [],
        complete: true,
        unavailablePaths: [],
    };
    assert.equal(clusterIsolationScore("src/candidate.ts", graph, new Set()), 0);
});
//# sourceMappingURL=fossil-grader-isolation-b.cases.js.map