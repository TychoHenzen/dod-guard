import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSimilarity } from "../../../src/commit-gate/architecture-similarity.js";
import { structuralFindings } from "../../../src/commit-gate/decision-findings-architecture.js";
import { config, fact, inDirectory } from "./architecture-similarity-test-support.js";

test("maps similarity evidence into the shared review finding path", () => {
  const files = [
    ...Array.from({ length: 24 }, (_, index) => inDirectory(fact(index, "billing"), "src/mixed")),
    inDirectory(fact(24, "shipping"), "src/mixed"),
  ];
  const [finding] = structuralFindings({
    beforeFiles: [],
    afterFiles: files,
    affectedPaths: ["src/mixed/shipping-24.ts"],
    config,
  });
  assert.equal(finding?.severity, "review");
  assert.match(finding?.reason ?? "", /similarity-outlier/);
  assert.ok(finding?.affectedPaths.includes("src/mixed/shipping-24.ts"));
});

test("ignores test files when selecting affected production directories", () => {
  const production = Array.from({ length: 25 }, (_, index) =>
    inDirectory(fact(index, "billing"), "src/billing"),
  );
  const testFile = { ...fact(0, "shipping"), path: "src/billing/billing.test.ts" };
  assert.deepEqual(
    analyzeSimilarity({
      afterFiles: [...production, testFile],
      affectedPaths: [testFile.path],
      config,
    }),
    [],
  );
});
