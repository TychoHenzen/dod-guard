import assert from "node:assert/strict";
import { test } from "node:test";
import { readBoundedReferenceSources } from "./ref-analyzer.js";

test("stops all later source reads when the total content budget is reached or exceeded", () => {
  const exactMetadataReads: string[] = [];
  const exactContentReads: string[] = [];
  const exactLimit = readBoundedReferenceSources({
    sources: [
      { path: "src/exact.ts", language: "typescript" as const },
      { path: "src/after-exact.ts", language: "typescript" as const },
    ],
    readMetadata: (source) => {
      exactMetadataReads.push(source.path);
      return { byteLength: source.path === "src/exact.ts" ? 10 : 1 };
    },
    readSource: (source) => {
      exactContentReads.push(source.path);
      return "content";
    },
    maximumFileBytes: 10,
    maximumTotalBytes: 10,
  });
  assert.deepEqual(exactMetadataReads, ["src/exact.ts"]);
  assert.deepEqual(exactContentReads, ["src/exact.ts"]);
  assert.equal(exactLimit.acceptedBytes, 10);
  assert.deepEqual(exactLimit.graph.unavailablePaths, ["src/after-exact.ts"]);

  const metadataReads: string[] = [];
  const contentReads: string[] = [];
  const exceededLimit = readBoundedReferenceSources({
    sources: [
      { path: "src/accepted.ts", language: "typescript" as const },
      { path: "src/exceeds.ts", language: "typescript" as const },
      { path: "src/smaller-later.ts", language: "typescript" as const },
    ],
    readMetadata: (source) => {
      metadataReads.push(source.path);
      return { byteLength: source.path === "src/accepted.ts" ? 6 : source.path === "src/exceeds.ts" ? 5 : 1 };
    },
    readSource: (source) => {
      contentReads.push(source.path);
      return "content";
    },
    maximumFileBytes: 10,
    maximumTotalBytes: 10,
  });
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
