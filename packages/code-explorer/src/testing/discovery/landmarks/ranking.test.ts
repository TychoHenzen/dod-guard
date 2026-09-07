import assert from "node:assert/strict";
import { it } from "node:test";
import { rankLandmarks, scoreLandmark } from "../../../discovery/landmarks.js";

it(
  "uses group, normalized path, kind, and identity to " +
    "order equal evidence",
  () => {
    const ranked = rankLandmarks([
      {
        symbol: {
          symbol_id: "zeta",
          name: "Zeta",
          path: "SRC\\b.ts",
          kind: "function",
        },
        references: [{ path: "app/a.ts", content: "production" }],
      },
      {
        symbol: {
          symbol_id: "beta",
          name: "Beta",
          path: "src/a.ts",
          kind: "method",
        },
        references: [{ path: "app/a.ts", content: "production" }],
      },
      {
        symbol: {
          symbol_id: "alpha",
          name: "Alpha",
          path: "src/a.ts",
          kind: "method",
        },
        references: [{ path: "app/a.ts", content: "production" }],
      },
      {
        symbol: {
          symbol_id: "event",
          name: "OrderEvent",
          path: "src/z.ts",
          kind: "type",
        },
        references: [{ path: "app/a.ts", content: "production" }],
      },
    ]);

    assert.deepEqual(
      ranked.map(({ symbol_id }) => symbol_id),
      ["event", "alpha", "beta", "zeta"],
    );
  },
);
it("records unavailable visibility as zero evidence", () => {
  const landmark = scoreLandmark({
    symbol: {
      symbol_id: "hidden",
      name: "Hidden",
      path: "src/hidden.ts",
      kind: "type",
    },
    references: [{ path: "app/main.ts", content: "production" }],
  });

  assert.equal(landmark.evidence.public_or_exported, false);
  assert.equal(landmark.evidence.sources.public_or_exported, "unavailable");
  assert.equal(landmark.score, 5);
});
