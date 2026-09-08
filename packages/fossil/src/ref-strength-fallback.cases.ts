import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeJavaScriptReferences, analyzeReferences } from "./ref-analyzer.js";

test("marks fallback conditional and default-expression uses as weak", () => {
  const graph = analyzeJavaScriptReferences([
    {
      path: "src/if.ts",
      language: "typescript",
      content: 'import { candidate } from "./candidate";\nif (fallback) {\n  if (true) { candidate(); }\n}\n',
    },
    {
      path: "src/else.ts",
      language: "typescript",
      content:
        'import { candidate } from "./candidate";\nif (live) { live(); }\n// legacy default path\nelse {\n  candidate();\n}\n',
    },
    {
      path: "src/or.ts",
      language: "typescript",
      content: 'import { candidate } from "./candidate";\nconst x = live || (\n  candidate()\n);\n',
    },
    {
      path: "src/nullish.ts",
      language: "typescript",
      content: 'import { candidate } from "./candidate";\nconst x = live ?? candidate;\n',
    },
    {
      path: "src/object.ts",
      language: "typescript",
      content:
        'import { candidate } from "./candidate";\nconst x = live ?? {\n  first: 1,\n  selected: candidate,\n};\n',
    },
    {
      path: "src/ordinary.ts",
      language: "typescript",
      content:
        'import { candidate } from "./candidate";\nconst label = "fallback if { candidate";\n// legacy if { candidate }\nconst unrelated = true;\nif (ordinaryMode) { candidate(); }\n',
    },
    { path: "src/candidate.ts", language: "typescript", content: "" },
  ]);
  assert.deepEqual(
    graph.edges.map((edge) => edge.strength),
    ["weak", "weak", "weak", "weak", "weak", "strong"],
  );
});

test("marks C# and Rust uses confined to guards as weak", () => {
  const graph = analyzeReferences([
    {
      path: "src/CWeak.cs",
      language: "csharp",
      content: "using App.Widget;\n#if ONE\n#if TWO\nWidget.Run();\n#endif\n#endif\n",
    },
    { path: "src/CStrong.cs", language: "csharp", content: "using App.Widget;\n#if ONE\n#endif\nWidget.Run();\n" },
    { path: "src/App/Widget.cs", language: "csharp", content: "" },
    {
      path: "crate/src/weak.rs",
      language: "rust",
      content: 'mod widget;\n#[cfg(feature = "x")]\nfn run() {\n  widget::run();\n}\n',
    },
    {
      path: "crate/src/strong.rs",
      language: "rust",
      content:
        'mod widget;\n#[cfg(feature = "x")]\nfn configured() {\n  widget::run();\n}\nfn ordinary() {\n  widget::run();\n}\n',
    },
    { path: "crate/src/use-only.rs", language: "rust", content: "use crate::widget;\n" },
    { path: "crate/src/widget/mod.rs", language: "rust", content: "" },
  ]);
  assert.deepEqual(
    graph.edges.map((edge) => edge.strength),
    ["weak", "strong", "weak", "strong", "strong"],
  );
});
