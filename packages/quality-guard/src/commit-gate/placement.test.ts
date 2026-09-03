import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import { analyzePlacement } from "./placement.js";

const config = parseQualityConfig(
  '{"directTypeLimit":2,"genericBuckets":["utils"],"generatedPaths":["generated/**"],"testPaths":["test/**"]}',
);
test("reports an added type when its direct production directory was already overloaded", () => {
  const result = analyzePlacement(
    [
      { path: "src/billing/Invoice.ts", types: ["Invoice"] },
      { path: "src/billing/Tax.ts", types: ["Tax"] },
      { path: "src/billing/Receipt.ts", types: ["Receipt"] },
      { path: "src/billing/Invoice.test.ts", types: ["InvoiceTest"] },
    ],
    [
      { path: "src/billing/Invoice.ts", types: ["Invoice"] },
      { path: "src/billing/Tax.ts", types: ["Tax"] },
      { path: "src/billing/Receipt.ts", types: ["Receipt"] },
      { path: "src/billing/Payment.ts", types: ["Payment"] },
      { path: "generated/billing/Generated.ts", types: ["Generated"] },
      { path: "src/billing/Invoice.test.ts", types: ["InvoiceTest"] },
    ],
    ["src/billing/Payment.ts"],
    config,
  );
  assert.deepEqual(result, [
    {
      kind: "flat-accumulation",
      directory: "src/billing",
      addedType: "Payment",
      beforeCount: 3,
      afterCount: 4,
      limit: 2,
    },
  ]);
});
test("does not report a type added below the limit in a non-generic domain directory", () => {
  const result = analyzePlacement(
    [{ path: "src/billing/Invoice.ts", types: ["Invoice"] }],
    [
      { path: "src/billing/Invoice.ts", types: ["Invoice"] },
      { path: "src/billing/Payment.ts", types: ["Payment"] },
    ],
    ["src/billing/Payment.ts"],
    config,
  );
  assert.deepEqual(result, []);
});

test("reports additions to a configured generic bucket even below the direct-type limit", () => {
  const result = analyzePlacement(
    [],
    [{ path: "src/utils/Format.ts", types: ["Format"] }],
    ["src/utils/Format.ts"],
    config,
  );
  assert.deepEqual(result, [
    {
      kind: "generic-bucket",
      directory: "src/utils",
      addedType: "Format",
      beforeCount: 0,
      afterCount: 1,
      limit: 2,
    },
  ]);
});
