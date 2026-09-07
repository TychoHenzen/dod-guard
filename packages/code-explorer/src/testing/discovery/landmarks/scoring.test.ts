import assert from "node:assert/strict";
import { it } from "node:test";
import { scoreLandmark } from "../../../discovery/landmarks.js";

it(
  "reports every observed evidence counter, source, and " + "declared score",
  () => {
    const landmark = scoreLandmark({
      symbol: {
        symbol_id: "order",
        name: "Order",
        path: "src/domain/order.ts",
        kind: "type",
      },
      references: [
        { path: "app/orders.ts", content: "production" },
        { path: "lib/exports.ts", content: "production" },
      ],
      incoming_call_sites: ["app/orders.ts:4"],
      public_or_exported: true,
    });

    assert.deepEqual(landmark.evidence, {
      production_reference_files: 2,
      incoming_call_sites: 1,
      directory_spread: 2,
      public_or_exported: true,
      test_only: false,
      sources: {
        production_reference_files: "semantic_references",
        directory_spread: "semantic_references",
        incoming_call_sites: "incoming_call_hierarchy",
        public_or_exported: "semantic_visibility",
        test_only: "classification",
      },
    });
    assert.equal(landmark.score, 19);
    assert.equal(landmark.eligible, true);
  },
);
it(
  "does not infer incoming calls when the backend leaves " +
    "that evidence unavailable",
  () => {
    const landmark = scoreLandmark({
      symbol: {
        symbol_id: "helper",
        name: "helper",
        path: "src/helper.ts",
        kind: "function",
      },
      references: [{ path: "app/main.ts", content: "production" }],
    });

    assert.equal(landmark.evidence.incoming_call_sites, 0);
    assert.equal(landmark.evidence.sources.incoming_call_sites, "unavailable");
    assert.equal(landmark.score, 5);
  },
);
