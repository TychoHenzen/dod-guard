import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSimilarity } from "../../../src/commit-gate/architecture-similarity.js";
import {
  config,
  fact,
  inDirectory,
} from "./architecture-similarity-test-support.js";

test("reports a changed similarity outlier from the current tree", () => {
  const files = [
    ...Array.from({ length: 24 }, (_, index) =>
      inDirectory(fact(index, "billing"), "src/mixed"),
    ),
    inDirectory(fact(24, "shipping"), "src/mixed"),
  ];
  const [finding] = analyzeSimilarity({
    afterFiles: files,
    affectedPaths: ["src/mixed/shipping-24.ts"],
    config,
  });
  assert.equal(finding?.kind, "similarity-outlier");
  assert.deepEqual(
    finding?.outliers.map((outlier) => outlier.path),
    ["src/mixed/shipping-24.ts"],
  );
});

test("ignores test files when selecting affected production directories", () => {
  const production = Array.from({ length: 25 }, (_, index) =>
    inDirectory(fact(index, "billing"), "src/billing"),
  );
  const testFile = {
    ...fact(0, "shipping"),
    path: "src/billing/billing.test.ts",
  };
  assert.deepEqual(
    analyzeSimilarity({
      afterFiles: [...production, testFile],
      affectedPaths: [testFile.path],
      config,
    }),
    [],
  );
});
