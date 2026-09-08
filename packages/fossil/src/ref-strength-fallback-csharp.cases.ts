import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeReferences } from "./ref-analyzer.js";

test("marks C# and Rust uses confined to guards as weak", () => {
  const graph = analyzeReferences([
    {
      path: "src/CWeak.cs",
      language: "csharp",
      content:
        "using App.Widget;\n#if ONE\n#if TWO\nWidget.Run();\n#endif\n#endif\n",
    },
    {
      path: "src/CStrong.cs",
      language: "csharp",
      content: "using App.Widget;\n#if ONE\n#endif\nWidget.Run();\n",
    },
    { path: "src/App/Widget.cs", language: "csharp", content: "" },
    {
      path: "crate/src/weak.rs",
      language: "rust",
      content:
        "mod widget;\n" +
        '#[cfg(feature = "x")]\nfn run() {\n' +
        "  widget::run();\n}\n",
    },
    {
      path: "crate/src/strong.rs",
      language: "rust",
      content:
        "mod widget;\n" +
        '#[cfg(feature = "x")]\nfn configured() {\n' +
        "  widget::run();\n}\nfn ordinary() {\n" +
        "  widget::run();\n}\n",
    },
    {
      path: "crate/src/use-only.rs",
      language: "rust",
      content: "use crate::widget;\n",
    },
    { path: "crate/src/widget/mod.rs", language: "rust", content: "" },
  ]);
  assert.deepEqual(
    graph.edges.map((edge) => edge.strength),
    ["weak", "strong", "weak", "strong", "strong"],
  );
});
