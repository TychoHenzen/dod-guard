import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { analyzeSimilarity } from "./architecture-similarity.js";
import { parseQualityConfig } from "./config.js";
import { structuralFindings } from "./decision-findings-architecture.js";

// test-sources: ./architecture-similarity-assessment.ts ./architecture-similarity-changes.ts ./architecture-similarity-clusters.ts ./architecture-similarity-outlier.ts ./architecture-similarity-signature.ts

const config = parseQualityConfig("{}");
function fact(
  index: number,
  domain: "billing" | "shipping",
): ArchitectureFileFact {
  const names =
    domain === "billing"
      ? {
          type: "BillingInvoiceHandler",
          member: "issueInvoice",
          dependency: "BillingLedger",
        }
      : {
          type: "ShippingManifestAdapter",
          member: "dispatchPackage",
          dependency: "ShippingCarrier",
        };
  return {
    path: `src/${domain}/${domain}-${index}.ts`,
    imports: [`./${names.dependency}`],
    references: [],
    types: [
      {
        name: `${names.type}${index}`,
        members: [{ name: names.member, kind: "method", visibility: "public" }],
        dependencies: [names.dependency],
        forwardingPaths: [],
      },
    ],
  };
}
function inDirectory(
  file: ArchitectureFileFact,
  directory: string,
): ArchitectureFileFact {
  return { ...file, path: `${directory}/${file.path.split("/").at(-1)}` };
}
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
test("maps similarity evidence into the shared review finding path", () => {
  const files = [
    ...Array.from({ length: 24 }, (_, index) =>
      inDirectory(fact(index, "billing"), "src/mixed"),
    ),
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
