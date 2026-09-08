import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeJavaScriptReferences } from "./ref-analyzer.js";
import { edgeSummary } from "./ref-analyzer.test-support.js";
test("resolves static, require, and dynamic relative module forms against current files", () => {
    const graph = analyzeJavaScriptReferences([
        {
            path: "src/main.ts",
            language: "typescript",
            content: 'import { feature } from "./feature";\nconst legacy = require("./legacy");\nconst dynamic = import("./dynamic");\nimport "./folder";\nimport "package-name";\n',
        },
        { path: "src/feature.ts", language: "typescript", content: "" },
        { path: "src/legacy.js", language: "javascript", content: "" },
        { path: "src/dynamic.mjs", language: "javascript", content: "" },
        { path: "src/folder/index.ts", language: "typescript", content: "" },
    ]);
    assert.deepEqual(edgeSummary(graph), [
        {
            sourcePath: "src/main.ts",
            targetPath: "src/feature.ts",
            language: "typescript",
            kind: "import",
            strength: "strong",
        },
        {
            sourcePath: "src/main.ts",
            targetPath: "src/legacy.js",
            language: "typescript",
            kind: "require",
            strength: "strong",
        },
        {
            sourcePath: "src/main.ts",
            targetPath: "src/dynamic.mjs",
            language: "typescript",
            kind: "dynamic-import",
            strength: "strong",
        },
        {
            sourcePath: "src/main.ts",
            targetPath: "src/folder/index.ts",
            language: "typescript",
            kind: "import",
            strength: "strong",
        },
    ]);
    assert.deepEqual(graph.edges.map((edge) => [edge.span.line, edge.span.column, edge.span.end - edge.span.start]), [
        [1, 26, 9],
        [2, 25, 8],
        [3, 25, 9],
        [4, 9, 8],
    ]);
    assert.deepEqual(graph.unresolved.map(({ sourcePath, targetCandidates, language, kind, resolution }) => ({
        sourcePath,
        targetCandidates,
        language,
        kind,
        resolution,
    })), [
        {
            sourcePath: "src/main.ts",
            targetCandidates: ["package-name"],
            language: "typescript",
            kind: "import",
            resolution: "external",
        },
    ]);
    assert.deepEqual(graph.unavailablePaths, []);
});
//# sourceMappingURL=ref-parsers-module.cases.js.map