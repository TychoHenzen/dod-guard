import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeJavaScriptReferences } from "./ref-analyzer.js";
test("keeps a mixed fallback and ordinary import use strong", () => {
    const graph = analyzeJavaScriptReferences([
        {
            path: "src/live.ts",
            language: "typescript",
            content: 'import { candidate } from "./candidate";\n' +
                "if (fallbackMode) {\n" +
                "  if (enabled) { candidate(); }\n}\n" +
                "export const ordinary = candidate();\n",
        },
        { path: "src/candidate.ts", language: "typescript", content: "" },
    ]);
    assert.deepEqual(graph.edges.map((edge) => edge.strength), ["strong"]);
});
//# sourceMappingURL=ref-candidate-strength.cases.js.map