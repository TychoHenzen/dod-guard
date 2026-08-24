import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeJavaScriptReferences,
  analyzeReferences,
  type ReferenceCandidate,
  readReferenceSources,
  unsupportedCandidateReferenceGraph,
} from "./ref-analyzer.js";

// covers: fossil/reference-analysis :: Replaceable reference backend :: Unsupported language degrades to Git evidence
test("marks unsupported candidate references unavailable without producing edges", () => {
  const candidates = [
    { path: "src/candidate.lua", language: "unsupported" as const },
    { path: "src/live.ts", language: "typescript" as const },
  ];
  assert.doesNotThrow(() => unsupportedCandidateReferenceGraph(candidates));
  const graph = unsupportedCandidateReferenceGraph(candidates);

  assert.deepEqual(graph, {
    edges: [],
    unresolved: [],
    complete: false,
    unavailablePaths: ["src/candidate.lua"],
  });
});

// covers: fossil/reference-analysis :: Replaceable reference backend :: Unreadable source does not stop analysis
test("continues after an unreadable source without exposing its read error", () => {
  const attemptedPaths: string[] = [];
  const sources = [
    { path: "src/candidate.ts", language: "typescript" as const },
    { path: "src/live.ts", language: "typescript" as const },
  ];
  const readSource = (source: ReferenceCandidate) => {
    attemptedPaths.push(source.path);
    if (source.path === "src/candidate.ts") throw new Error("sensitive filesystem error");
    return "export const live = true;\n";
  };

  const result = readReferenceSources(sources, readSource);

  assert.deepEqual(attemptedPaths, ["src/candidate.ts", "src/live.ts"]);
  assert.deepEqual(result.sources, [
    { path: "src/live.ts", language: "typescript", content: "export const live = true;\n" },
  ]);
  assert.deepEqual(result.graph, {
    edges: [],
    unresolved: [],
    complete: false,
    unavailablePaths: ["src/candidate.ts"],
  });
  assert.deepEqual(result.warnings, [
    { code: "reference_unreadable", message: "Reference source could not be read.", path: "src/candidate.ts" },
  ]);
});

// covers: fossil/reference-analysis :: TypeScript and JavaScript references :: JavaScript module forms create graph edges
test("resolves static, require, and dynamic relative module forms against current files", () => {
  const graph = analyzeJavaScriptReferences([
    {
      path: "src/main.ts",
      language: "typescript",
      content:
        'import { feature } from "./feature";\nconst legacy = require("./legacy");\nconst dynamic = import("./dynamic");\nimport "./folder";\nimport "package-name";\n',
    },
    { path: "src/feature.ts", language: "typescript", content: "" },
    { path: "src/legacy.js", language: "javascript", content: "" },
    { path: "src/dynamic.mjs", language: "javascript", content: "" },
    { path: "src/folder/index.ts", language: "typescript", content: "" },
  ]);

  assert.deepEqual(
    graph.edges.map(({ sourcePath, targetPath, language, kind, strength }) => ({
      sourcePath,
      targetPath,
      language,
      kind,
      strength,
    })),
    [
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
    ],
  );
  assert.deepEqual(
    graph.edges.map((edge) => [edge.span.line, edge.span.column, edge.span.end - edge.span.start]),
    [
      [1, 26, 9],
      [2, 25, 8],
      [3, 25, 9],
      [4, 9, 8],
    ],
  );
  assert.deepEqual(
    graph.unresolved.map(({ sourcePath, targetCandidates, language, kind, resolution }) => ({
      sourcePath,
      targetCandidates,
      language,
      kind,
      resolution,
    })),
    [
      {
        sourcePath: "src/main.ts",
        targetCandidates: ["package-name"],
        language: "typescript",
        kind: "import",
        resolution: "external",
      },
    ],
  );
  assert.deepEqual(graph.unavailablePaths, []);
});

// covers: fossil/reference-analysis :: C# references :: Unambiguous C# namespace resolves
test("resolves one namespace-level C# using to its unique current path suffix", () => {
  const graph = analyzeReferences([
    {
      path: "src/App/Program.cs",
      language: "csharp",
      content:
        "using Company.Tools.Widget;\nusing Alias = Company.Tools.Alias;\nusing static Company.Tools.Static;\nclass Program {\n  void Run() {\n    using Company.Block.Local;\n  }\n}\n",
    },
    { path: "src/Company/Tools/Widget.cs", language: "csharp", content: "" },
  ]);

  assert.deepEqual(
    graph.edges.map(({ sourcePath, targetPath, language, kind, strength, span }) => ({
      sourcePath,
      targetPath,
      language,
      kind,
      strength,
      span: [span.line, span.column, span.end - span.start],
    })),
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
});

// covers: fossil/reference-analysis :: C# references :: Ambiguous C# namespace is not invented
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
    graph.unresolved.map(({ sourcePath, targetCandidates, language, kind, resolution, span }) => ({
      sourcePath,
      targetCandidates,
      language,
      kind,
      resolution,
      span: [span.line, span.column, span.end - span.start],
    })),
    [
      {
        sourcePath: "src/App/Program.cs",
        targetCandidates: ["alpha/Company/Tools/Widget.cs", "zeta/Company/Tools/Widget.cs"],
        language: "csharp",
        kind: "csharp-using",
        resolution: "unresolved",
        span: [1, 7, "Company.Tools.Widget".length],
      },
    ],
  );
});

// covers: fossil/reference-analysis :: Rust references :: Rust module statement creates graph edge
test("resolves sibling, module-directory, and nearest-Cargo-root Rust modules", () => {
  const graph = analyzeReferences([
    {
      path: "workspace/app/src/main.rs",
      language: "rust",
      content: "mod sibling;\nmod folder;\nmod missing;\nuse crate::models::user;\n",
    },
    { path: "workspace/app/src/sibling.rs", language: "rust", content: "" },
    { path: "workspace/app/src/folder/mod.rs", language: "rust", content: "" },
    { path: "workspace/app/src/models/user.rs", language: "rust", content: "" },
    {
      path: "workspace/app/tools/nested/src/main.rs",
      language: "rust",
      content: "use crate::models::user;\n",
    },
    { path: "workspace/app/tools/nested/src/models/user/mod.rs", language: "rust", content: "" },
  ]);

  assert.deepEqual(
    graph.edges.map(({ sourcePath, targetPath, language, kind, strength }) => ({
      sourcePath,
      targetPath,
      language,
      kind,
      strength,
    })),
    [
      {
        sourcePath: "workspace/app/src/main.rs",
        targetPath: "workspace/app/src/sibling.rs",
        language: "rust",
        kind: "rust-mod",
        strength: "strong",
      },
      {
        sourcePath: "workspace/app/src/main.rs",
        targetPath: "workspace/app/src/folder/mod.rs",
        language: "rust",
        kind: "rust-mod",
        strength: "strong",
      },
      {
        sourcePath: "workspace/app/src/main.rs",
        targetPath: "workspace/app/src/models/user.rs",
        language: "rust",
        kind: "rust-use",
        strength: "strong",
      },
      {
        sourcePath: "workspace/app/tools/nested/src/main.rs",
        targetPath: "workspace/app/tools/nested/src/models/user/mod.rs",
        language: "rust",
        kind: "rust-use",
        strength: "strong",
      },
    ],
  );
  assert.deepEqual(
    graph.unresolved.map(({ sourcePath, targetCandidates, kind, resolution }) => ({
      sourcePath,
      targetCandidates,
      kind,
      resolution,
    })),
    [
      {
        sourcePath: "workspace/app/src/main.rs",
        targetCandidates: ["workspace/app/src/missing.rs", "workspace/app/src/missing/mod.rs"],
        kind: "rust-mod",
        resolution: "unresolved",
      },
    ],
  );
});
