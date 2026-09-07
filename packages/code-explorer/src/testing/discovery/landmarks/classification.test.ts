import assert from "node:assert/strict";
import { it } from "node:test";
import {
  defaultLandmarks,
  rankLandmarks,
} from "../../../discovery/landmarks.js";

it(
  "penalizes a test-only candidate below an otherwise " +
    "comparable production candidate",
  () => {
    const [production, testOnly] = rankLandmarks([
      {
        symbol: {
          symbol_id: "production",
          name: "Production",
          path: "src/production.ts",
          kind: "type",
        },
        references: [{ path: "app/main.ts", content: "production" }],
      },
      {
        symbol: {
          symbol_id: "test",
          name: "TestOnly",
          path: "src/test-only.ts",
          kind: "type",
        },
        references: [{ path: "tests/test-only.test.ts", content: "test" }],
      },
    ]);

    assert.equal(production?.symbol_id, "production");
    assert.equal(testOnly?.symbol_id, "test");
    assert.equal(testOnly?.evidence.test_only, true);
    assert.equal(testOnly?.evidence.sources.test_only, "classification");
    assert.equal(testOnly?.score, -20);
  },
);
it(
  "keeps only the source identity when generated output " + "duplicates it",
  () => {
    const landmarks = defaultLandmarks([
      {
        symbol: {
          symbol_id: "Order",
          name: "Order",
          path: "src/order.ts",
          kind: "type",
        },
        references: [{ path: "app/main.ts", content: "production" }],
      },
      {
        symbol: {
          symbol_id: "Order",
          name: "Order",
          path: "dist/order.js",
          kind: "type",
        },
        references: [{ path: "app/main.ts", content: "production" }],
        generated_only: true,
      },
    ]);

    assert.deepEqual(
      landmarks.map((landmark) => landmark.path),
      ["src/order.ts"],
    );
  },
);
