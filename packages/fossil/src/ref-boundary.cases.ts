import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeJavaScriptReferencesWithinBoundary } from "./ref-analyzer.js";

test(
  "rejects lexical and canonical relative-import escapes without exposing " +
    "external paths",
  () => {
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
        canonicalize: (path) =>
          path === "C:/repo/src/linked.ts" ? externalPath : path,
      },
    );

    assert.deepEqual(
      result.graph.edges.map(({ sourcePath, targetPath }) => ({
        sourcePath,
        targetPath,
      })),
      [{ sourcePath: "src/valid-user.ts", targetPath: "src/valid.ts" }],
    );
    assert.deepEqual(result.graph.unresolved, []);
    assert.deepEqual(result.warnings, [
      {
        code: "reference_outside_boundary",
        message:
          "Relative reference target is outside the repository boundary.",
        path: "src/lexical.ts",
      },
      {
        code: "reference_outside_boundary",
        message:
          "Relative reference target is outside the repository boundary.",
        path: "src/link-user.ts",
      },
    ]);
    assert.equal(JSON.stringify(result.warnings).includes(externalPath), false);
  },
);
