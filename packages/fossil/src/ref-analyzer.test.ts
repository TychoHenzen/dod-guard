import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeJavaScriptReferences,
  analyzeJavaScriptReferencesWithinBoundary,
  analyzeReferences,
  inventoryReferenceSourcePaths,
  markUnresolvedCandidateEvidence,
  type ReferenceCandidate,
  readBoundedReferenceSources,
  readReferenceSources,
  regradeVestigialEdges,
  unsupportedCandidateReferenceGraph,
} from "./ref-analyzer.js";

// covers: fossil/reference-analysis :: Bounded source scanning :: Oversized source degrades reference evidence
test("skips oversized sources before reading content and retains later bounded sources", () => {
  const maximumBytes = 1_048_576;
  const contentReads: string[] = [];
  const sources = [
    { path: "src/exact.ts", language: "typescript" as const },
    { path: "src/oversized.ts", language: "typescript" as const },
    { path: "src/later.ts", language: "typescript" as const },
  ];
  const sizes = new Map([
    ["src/exact.ts", maximumBytes],
    ["src/oversized.ts", maximumBytes + 1],
    ["src/later.ts", 7],
  ]);
  const result = readBoundedReferenceSources(
    sources,
    (source) => ({ byteLength: sizes.get(source.path) ?? 0 }),
    (source) => {
      contentReads.push(source.path);
      return `// ${source.path}\n`;
    },
  );

  assert.deepEqual(contentReads, ["src/exact.ts", "src/later.ts"]);
  assert.deepEqual(
    result.sources.map((source) => source.path),
    ["src/exact.ts", "src/later.ts"],
  );
  assert.deepEqual(result.graph, {
    edges: [],
    unresolved: [],
    complete: false,
    unavailablePaths: ["src/oversized.ts"],
  });
  assert.deepEqual(result.warnings, [
    {
      code: "reference_content_limit",
      message: "Reference source exceeds the per-file content limit.",
      path: "src/oversized.ts",
    },
  ]);
  assert.equal(result.acceptedBytes, maximumBytes + 7);
});

// covers: fossil/reference-analysis :: Bounded source scanning :: Total scan budget stops further content reads
test("stops all later source reads when the total content budget is reached or exceeded", () => {
  const exactMetadataReads: string[] = [];
  const exactContentReads: string[] = [];
  const exactLimit = readBoundedReferenceSources(
    [
      { path: "src/exact.ts", language: "typescript" as const },
      { path: "src/after-exact.ts", language: "typescript" as const },
    ],
    (source) => {
      exactMetadataReads.push(source.path);
      return { byteLength: source.path === "src/exact.ts" ? 10 : 1 };
    },
    (source) => {
      exactContentReads.push(source.path);
      return "content";
    },
    10,
    10,
  );
  assert.deepEqual(exactMetadataReads, ["src/exact.ts"]);
  assert.deepEqual(exactContentReads, ["src/exact.ts"]);
  assert.equal(exactLimit.acceptedBytes, 10);
  assert.deepEqual(exactLimit.graph.unavailablePaths, ["src/after-exact.ts"]);

  const metadataReads: string[] = [];
  const contentReads: string[] = [];
  const exceededLimit = readBoundedReferenceSources(
    [
      { path: "src/accepted.ts", language: "typescript" as const },
      { path: "src/exceeds.ts", language: "typescript" as const },
      { path: "src/smaller-later.ts", language: "typescript" as const },
    ],
    (source) => {
      metadataReads.push(source.path);
      return { byteLength: source.path === "src/accepted.ts" ? 6 : source.path === "src/exceeds.ts" ? 5 : 1 };
    },
    (source) => {
      contentReads.push(source.path);
      return "content";
    },
    10,
    10,
  );
  assert.deepEqual(metadataReads, ["src/accepted.ts", "src/exceeds.ts"]);
  assert.deepEqual(contentReads, ["src/accepted.ts"]);
  assert.equal(exceededLimit.acceptedBytes, 6);
  assert.deepEqual(exceededLimit.graph, {
    edges: [],
    unresolved: [],
    complete: false,
    unavailablePaths: ["src/exceeds.ts", "src/smaller-later.ts"],
  });
  assert.deepEqual(
    exceededLimit.warnings.map(({ code, path }) => ({ code, path })),
    [
      { code: "reference_content_limit", path: "src/exceeds.ts" },
      { code: "reference_content_limit", path: "src/smaller-later.ts" },
    ],
  );
});

// covers: fossil/reference-analysis :: Repository-contained source reads :: Directory symlink is not traversed
test("inventories ordinary directories without traversing links or duplicate canonical directories", () => {
  const canonicalized: string[] = [];
  const enumerated: string[] = [];
  const entries = new Map([
    [
      "C:/repo",
      [
        { name: "junction", kind: "junction" as const },
        { name: "linked", kind: "directory-symlink" as const },
        { name: "src", kind: "directory" as const },
        { name: "zsecond", kind: "directory" as const },
        { name: "root.ts", kind: "file" as const },
      ],
    ],
    ["C:/repo/src", [{ name: "nested.ts", kind: "file" as const }]],
    ["C:/repo/zsecond", [{ name: "duplicate.ts", kind: "file" as const }]],
  ]);
  const paths = inventoryReferenceSourcePaths({
    repositoryRoot: "C:/repo",
    canonicalize: (path) => {
      canonicalized.push(path);
      return path === "C:/repo/zsecond" ? "C:/repo/src" : path;
    },
    enumerate: (path) => {
      enumerated.push(path);
      return entries.get(path) ?? [];
    },
  });

  assert.deepEqual(paths, ["root.ts", "src/nested.ts"]);
  assert.deepEqual(enumerated, ["C:/repo", "C:/repo/src"]);
  assert.deepEqual(canonicalized, [
    "C:/repo",
    "C:/repo/root.ts",
    "C:/repo/src",
    "C:/repo/src/nested.ts",
    "C:/repo/zsecond",
  ]);
});

// covers: fossil/reference-analysis :: Repository-contained source reads :: Relative import cannot escape the repository
test("rejects lexical and canonical relative-import escapes without exposing external paths", () => {
  const externalPath = "C:/private/secret.ts";
  const result = analyzeJavaScriptReferencesWithinBoundary(
    [
      {
        path: "src/lexical.ts",
        language: "typescript",
        content: 'import "../../secret";\n',
      },
      {
        path: "src/link-user.ts",
        language: "typescript",
        content: 'import "./linked";\n',
      },
      { path: "src/linked.ts", language: "typescript", content: "" },
      {
        path: "src/valid-user.ts",
        language: "typescript",
        content: 'import "./valid";\n',
      },
      { path: "src/valid.ts", language: "typescript", content: "" },
    ],
    {
      canonicalRepositoryRoot: "C:/repo",
      canonicalize: (path) => (path === "C:/repo/src/linked.ts" ? externalPath : path),
    },
  );

  assert.deepEqual(
    result.graph.edges.map(({ sourcePath, targetPath }) => ({ sourcePath, targetPath })),
    [{ sourcePath: "src/valid-user.ts", targetPath: "src/valid.ts" }],
  );
  assert.deepEqual(result.graph.unresolved, []);
  assert.deepEqual(result.warnings, [
    {
      code: "reference_outside_boundary",
      message: "Relative reference target is outside the repository boundary.",
      path: "src/lexical.ts",
    },
    {
      code: "reference_outside_boundary",
      message: "Relative reference target is outside the repository boundary.",
      path: "src/link-user.ts",
    },
  ]);
  assert.equal(JSON.stringify(result.warnings).includes(externalPath), false);
});

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

// covers: fossil/reference-analysis :: Reference strength :: Normal direct use is strong
test("keeps an ordinary imported candidate use as a strong inbound reference", () => {
  const graph = analyzeJavaScriptReferences([
    {
      path: "src/live.ts",
      language: "typescript",
      content: 'import { candidate } from "./candidate";\nexport const result = candidate();\n',
    },
    { path: "src/candidate.ts", language: "typescript", content: "export const candidate = () => true;\n" },
  ]);

  assert.deepEqual(
    graph.edges.map(({ sourcePath, targetPath, strength }) => ({ sourcePath, targetPath, strength })),
    [{ sourcePath: "src/live.ts", targetPath: "src/candidate.ts", strength: "strong" }],
  );
});

// covers: fossil/reference-analysis :: Reference strength :: Try or catch use is weak
test("marks imports used only in balanced try or catch bodies as weak", () => {
  const graph = analyzeJavaScriptReferences([
    {
      path: "src/try-only.ts",
      language: "typescript",
      content: 'import { candidate } from "./candidate";\ntry {\n  if (true) { candidate("}"); } // }\n}\n',
    },
    {
      path: "src/catch-only.ts",
      language: "typescript",
      content:
        'import { candidate } from "./candidate";\ntry { throw Error(); } catch (error /* a deliberately long comment before the body opens */) {\n  candidate(error);\n}\n',
    },
    {
      path: "src/multiple-bindings.ts",
      language: "typescript",
      content:
        'import defaultCandidate, * as candidates from "./candidate";\nimport { candidate as aliasedCandidate, anotherCandidate } from "./candidate";\ntry {\n  defaultCandidate();\n  candidates.run();\n} catch (error /* a deliberately long comment before the body opens */) {\n  aliasedCandidate(error);\n  anotherCandidate(error);\n}\n',
    },
    {
      path: "src/dollar-binding.ts",
      language: "typescript",
      content: 'import { candidate as $candidate } from "./candidate";\ntry { $candidate(); } catch {}\n',
    },
    { path: "src/candidate.ts", language: "typescript", content: "" },
  ]);

  assert.deepEqual(
    graph.edges.map((edge) => edge.strength),
    ["weak", "weak", "weak", "weak", "weak"],
  );
});

// covers: fossil/reference-analysis :: Reference strength :: Conditional fallback use is weak
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

// covers: fossil/reference-analysis :: Reference strength :: Guarded use is weak
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

// covers: fossil/reference-analysis :: Vestigial references :: Fossils do not keep each other alive
test("regrades only candidate-to-candidate edges without mutating the graph", () => {
  const graph = {
    edges: [
      {
        sourcePath: "a.ts",
        targetPath: "b.ts",
        language: "typescript" as const,
        kind: "import" as const,
        strength: "strong" as const,
        span: { start: 0, end: 1, line: 1, column: 1 },
      },
      {
        sourcePath: "live.ts",
        targetPath: "a.ts",
        language: "typescript" as const,
        kind: "import" as const,
        strength: "weak" as const,
        span: { start: 2, end: 3, line: 1, column: 3 },
      },
      {
        sourcePath: "a.ts",
        targetPath: "live.ts",
        language: "typescript" as const,
        kind: "import" as const,
        strength: "strong" as const,
        span: { start: 4, end: 5, line: 1, column: 5 },
      },
    ],
    unresolved: [],
    complete: true,
    unavailablePaths: [],
  };
  const result = regradeVestigialEdges(graph, new Set(["a.ts", "b.ts"]));
  assert.deepEqual(
    result.edges.map((edge) => edge.strength),
    ["vestigial", "weak", "strong"],
  );
  assert.equal(graph.edges[0].strength, "strong");
});

// covers: fossil/reference-analysis :: Replaceable reference backend :: Potentially relevant unresolved reference is incomplete evidence
test("marks only tail or uniquely named unresolved candidate paths unavailable", () => {
  const graph = {
    edges: [],
    unresolved: [
      {
        sourcePath: "live.ts",
        targetCandidates: ["lib/tail", "unique", "shared", "tail", ""],
        language: "typescript" as const,
        kind: "import" as const,
        span: { start: 0, end: 1, line: 1, column: 1 },
        resolution: "unresolved" as const,
      },
      {
        sourcePath: "live.ts",
        targetCandidates: ["package"],
        language: "typescript" as const,
        kind: "import" as const,
        span: { start: 2, end: 3, line: 1, column: 3 },
        resolution: "external" as const,
      },
    ],
    complete: false,
    unavailablePaths: ["existing.ts"],
  };
  const result = markUnresolvedCandidateEvidence(
    graph,
    new Set(["src/lib/tail.ts", "src/unique.ts", "a/shared.ts", "b/shared.ts", "src/retail.ts", "src/package.ts"]),
  );
  assert.deepEqual(result.unavailablePaths, ["existing.ts", "src/lib/tail.ts", "src/unique.ts"]);
  assert.equal(result.complete, false);
  assert.deepEqual(graph.unavailablePaths, ["existing.ts"]);
});

// covers: fossil/reference-analysis :: Reference strength :: Mixed normal and fallback use is strong
test("keeps a mixed fallback and ordinary import use strong", () => {
  const graph = analyzeJavaScriptReferences([
    {
      path: "src/live.ts",
      language: "typescript",
      content:
        'import { candidate } from "./candidate";\nif (fallbackMode) {\n  if (enabled) { candidate(); }\n}\nexport const ordinary = candidate();\n',
    },
    { path: "src/candidate.ts", language: "typescript", content: "" },
  ]);
  assert.deepEqual(
    graph.edges.map((edge) => edge.strength),
    ["strong"],
  );
});
