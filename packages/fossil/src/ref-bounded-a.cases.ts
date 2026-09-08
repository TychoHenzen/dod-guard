import assert from "node:assert/strict";
import { test } from "node:test";
import { readBoundedReferenceSources } from "./ref-analyzer.js";

test(
  "skips oversized sources before reading content and retains later bounded " +
    "sources",
  () => {
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
    const result = readBoundedReferenceSources({
      sources,
      readMetadata: (source) => ({ byteLength: sizes.get(source.path) ?? 0 }),
      readSource: (source) => {
        contentReads.push(source.path);
        return `// ${source.path}\n`;
      },
    });

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
  },
);

test(
  "omits binary content from bounded reference sources and continues with " +
    "later text",
  () => {
    const sourceContents = new Map([
      ["src/binary.ts", "text\0not-source"],
      ["src/later.ts", "export const later = true;\n"],
    ]);
    const result = readBoundedReferenceSources({
      sources: [
        { path: "src/binary.ts", language: "typescript" as const },
        { path: "src/later.ts", language: "typescript" as const },
      ],
      readMetadata: () => ({ byteLength: 12 }),
      readSource: (source) => sourceContents.get(source.path) ?? "",
    });

    assert.deepEqual(result.sources, [
      {
        path: "src/later.ts",
        language: "typescript",
        content: "export const later = true;\n",
      },
    ]);
    assert.deepEqual(result.graph, {
      edges: [],
      unresolved: [],
      complete: false,
      unavailablePaths: ["src/binary.ts"],
    });
    assert.deepEqual(result.warnings, [
      {
        code: "reference_binary",
        message: "Reference source is binary.",
        path: "src/binary.ts",
      },
    ]);
    assert.equal(result.acceptedBytes, 12);
    assert.equal(
      JSON.stringify(result.sources).includes("text\0not-source"),
      false,
    );
  },
);
