import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeJavaScriptReferences } from "./ref-analyzer.js";
test("marks fallback conditional and default-expression uses as weak", () => {
    const graph = analyzeJavaScriptReferences([
        {
            path: "src/if.ts",
            language: "typescript",
            content: 'import { candidate } from "./candidate";\n' +
                "if (fallback) {\n" +
                "  if (true) { candidate(); }\n}\n",
        },
        {
            path: "src/else.ts",
            language: "typescript",
            content: 'import { candidate } from "./candidate";\n' +
                "if (live) { live(); }\n" +
                "// legacy default path\nelse {\n" +
                "  candidate();\n}\n",
        },
        {
            path: "src/or.ts",
            language: "typescript",
            content: 'import { candidate } from "./candidate";\n' +
                "const x = live || (\n  candidate()\n);\n",
        },
        {
            path: "src/nullish.ts",
            language: "typescript",
            content: 'import { candidate } from "./candidate";\n' +
                "const x = live ?? candidate;\n",
        },
        {
            path: "src/object.ts",
            language: "typescript",
            content: 'import { candidate } from "./candidate";\n' +
                "const x = live ?? {\n" +
                "  first: 1,\n  selected: candidate,\n};\n",
        },
        {
            path: "src/ordinary.ts",
            language: "typescript",
            content: 'import { candidate } from "./candidate";\n' +
                'const label = "fallback if { candidate";\n' +
                "// legacy if { candidate }\n" +
                "const unrelated = true;\n" +
                "if (ordinaryMode) { candidate(); }\n",
        },
        { path: "src/candidate.ts", language: "typescript", content: "" },
    ]);
    assert.deepEqual(graph.edges.map((edge) => edge.strength), ["weak", "weak", "weak", "weak", "weak", "strong"]);
});
//# sourceMappingURL=ref-strength-fallback.cases.js.map