import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeReferences } from "./ref-analyzer.js";

test(
  "resolves one namespace-level C# using to its " +
    "unique current path suffix",
  () => {
    const graph = analyzeReferences([
      {
        path: "src/App/Program.cs",
        language: "csharp",
        content:
          "using Company.Tools.Widget;\n" +
          "using Alias = Company.Tools.Alias;\n" +
          "using static Company.Tools.Static;\n" +
          "class Program {\n  void Run() {\n" +
          "    using Company.Block.Local;\n  }\n}\n",
      },
      { path: "src/Company/Tools/Widget.cs", language: "csharp", content: "" },
    ]);

    assert.deepEqual(
      graph.edges.map(
        ({ sourcePath, targetPath, language, kind, strength, span }) => ({
          sourcePath,
          targetPath,
          language,
          kind,
          strength,
          span: [span.line, span.column, span.end - span.start],
        }),
      ),
      [
        {
          sourcePath: "src/App/Program.cs",
          targetPath: "src/Company/Tools/Widget.cs",
          language: "csharp",
          kind: "csharp-using",
          strength: "strong",
          span: [1, 7, "Company.Tools.Widget".length],
        },
      ],
    );
    assert.deepEqual(graph.unresolved, []);
  },
);

test("retains all sorted C# namespace matches as unresolved evidence", () => {
  const graph = analyzeReferences([
    {
      path: "src/App/Program.cs",
      language: "csharp",
      content: "using Company.Tools.Widget;\n",
    },
    { path: "zeta/Company/Tools/Widget.cs", language: "csharp", content: "" },
    { path: "alpha/Company/Tools/Widget.cs", language: "csharp", content: "" },
  ]);

  assert.deepEqual(graph.edges, []);
  assert.deepEqual(
    graph.unresolved.map(
      ({ sourcePath, targetCandidates, language, kind, resolution, span }) => ({
        sourcePath,
        targetCandidates,
        language,
        kind,
        resolution,
        span: [span.line, span.column, span.end - span.start],
      }),
    ),
    [
      {
        sourcePath: "src/App/Program.cs",
        targetCandidates: [
          "alpha/Company/Tools/Widget.cs",
          "zeta/Company/Tools/Widget.cs",
        ],
        language: "csharp",
        kind: "csharp-using",
        resolution: "unresolved",
        span: [1, 7, "Company.Tools.Widget".length],
      },
    ],
  );
});
