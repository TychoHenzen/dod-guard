import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSimilarity } from "../../../src/commit-gate/architecture-similarity.js";
import {
  config,
  fact,
  inDirectory,
} from "./architecture-similarity-test-support.js";

test("keeps a coherent directory together beyond the similarity trigger", () => {
  const files = Array.from({ length: 25 }, (_, index) =>
    fact(index, "billing"),
  );
  assert.deepEqual(
    analyzeSimilarity({
      afterFiles: files,
      affectedPaths: [files[0].path],
      config,
    }),
    [],
  );
});

test("reports a large-directory outlier with its nearest cluster", () => {
  const files = [
    ...Array.from({ length: 24 }, (_, index) =>
      inDirectory(fact(index, "billing"), "src/mixed"),
    ),
    inDirectory(fact(24, "shipping"), "src/mixed"),
  ];
  const [finding] = analyzeSimilarity({
    afterFiles: files,
    affectedPaths: [files.at(-1)?.path ?? ""],
    config,
  });
  assert.equal(finding?.kind, "similarity-outlier");
  assert.equal(finding?.trigger, "file-count");
  assert.deepEqual(
    finding?.outliers.map((outlier) => outlier.path),
    ["src/mixed/shipping-24.ts"],
  );
  assert.equal(finding?.outliers[0]?.nearest, "src/mixed/billing-0.ts");
  assert.deepEqual(
    analyzeSimilarity({
      afterFiles: files,
      affectedPaths: [files[0].path],
      config,
    }),
    [],
  );
});

test("reports distinct ownership clusters in a smaller directory", () => {
  const files = [
    inDirectory(fact(0, "billing"), "src/mixed"),
    inDirectory(fact(1, "billing"), "src/mixed"),
    inDirectory(fact(0, "shipping"), "src/mixed"),
    inDirectory(fact(1, "shipping"), "src/mixed"),
  ];
  const [finding] = analyzeSimilarity({
    afterFiles: files,
    affectedPaths: [files[0].path],
    config,
  });
  assert.equal(finding?.kind, "similarity-split");
  assert.equal(finding?.trigger, "distinct-clusters");
  assert.deepEqual(finding?.clusters, [
    ["src/mixed/billing-0.ts", "src/mixed/billing-1.ts"],
    ["src/mixed/shipping-0.ts", "src/mixed/shipping-1.ts"],
  ]);
});
