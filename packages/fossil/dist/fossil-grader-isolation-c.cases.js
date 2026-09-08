import assert from "node:assert/strict";
import { test } from "node:test";
import { referenceWeaknessScore } from "./fossil-grader.js";
import { referenceEdge } from "./fossil-grader.test-support.js";
test("gives full weakness when no unique strong live " + "inbound source remains", () => {
    const graph = {
        edges: [
            {
                sourcePath: "src/weak.ts",
                targetPath: "src/candidate.ts",
                language: "typescript",
                kind: "import",
                strength: "weak",
                span: { start: 0, end: 1, line: 1, column: 1 },
            },
            {
                sourcePath: "src/vestigial.ts",
                targetPath: "src/candidate.ts",
                language: "typescript",
                kind: "import",
                strength: "vestigial",
                span: { start: 1, end: 2, line: 1, column: 2 },
            },
            {
                sourcePath: "src/candidate.ts",
                targetPath: "src/live.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 2, end: 3, line: 1, column: 3 },
            },
            referenceEdge({
                sourcePath: "src/candidate.ts",
                targetPath: "src/candidate.ts",
                start: 3,
                column: 4,
            }),
            {
                sourcePath: "src/other-candidate.ts",
                targetPath: "src/candidate.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 4, end: 5, line: 1, column: 5 },
            },
            {
                sourcePath: "src/other-candidate.ts",
                targetPath: "src/candidate.ts",
                language: "typescript",
                kind: "import",
                strength: "strong",
                span: { start: 5, end: 6, line: 1, column: 6 },
            },
        ],
        unresolved: [],
        complete: true,
        unavailablePaths: [],
    };
    assert.equal(referenceWeaknessScore("src/candidate.ts", graph, new Set(["src/other-candidate.ts"])), 1);
});
//# sourceMappingURL=fossil-grader-isolation-c.cases.js.map