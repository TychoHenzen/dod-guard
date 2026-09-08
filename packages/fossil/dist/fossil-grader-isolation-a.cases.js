import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterIsolationScore } from "./fossil-grader.js";
import { referenceEdge } from "./fossil-grader.test-support.js";
test("gives full isolation when every unique resolved neighbor is a fossil candidate", () => {
    const graph = {
        edges: [
            {
                sourcePath: "src/fossil-inbound.ts",
                targetPath: "src/candidate.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 0, end: 1, line: 1, column: 1 },
            },
            {
                sourcePath: "src/candidate.ts",
                targetPath: "src/fossil-outbound.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 1, end: 2, line: 1, column: 2 },
            },
            {
                sourcePath: "src/fossil-outbound.ts",
                targetPath: "src/candidate.ts",
                language: "typescript",
                kind: "require",
                strength: "strong",
                span: { start: 2, end: 3, line: 1, column: 3 },
            },
            referenceEdge({ sourcePath: "src/candidate.ts", targetPath: "src/candidate.ts", start: 3, column: 4 }),
            {
                sourcePath: "src/live-a.ts",
                targetPath: "src/live-b.ts",
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
    assert.equal(clusterIsolationScore("src/candidate.ts", graph, new Set(["src/fossil-inbound.ts", "src/fossil-outbound.ts"])), 1);
});
test("gives full isolation when self, unresolved, and unrelated references are the only evidence", () => {
    const graph = {
        edges: [
            {
                sourcePath: "src/candidate.ts",
                targetPath: "src/candidate.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 0, end: 1, line: 1, column: 1 },
            },
            {
                sourcePath: "src/other-a.ts",
                targetPath: "src/other-b.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 1, end: 2, line: 1, column: 2 },
            },
        ],
        unresolved: [
            {
                sourcePath: "src/candidate.ts",
                targetCandidates: ["src/missing.ts"],
                language: "typescript",
                kind: "import",
                span: { start: 2, end: 3, line: 1, column: 3 },
                resolution: "unresolved",
            },
        ],
        complete: false,
        unavailablePaths: ["src/missing.ts"],
    };
    assert.equal(clusterIsolationScore("src/candidate.ts", graph, new Set()), 1);
});
//# sourceMappingURL=fossil-grader-isolation-a.cases.js.map