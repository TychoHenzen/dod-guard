import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDecision } from "../../../src/commit-gate/cli.js";
import type { DecisionResult } from "../../../src/commit-gate/types.js";

const review: DecisionResult = {
  verdict: "REVIEW_REQUIRED",
  findings: [],
  errors: [],
  input: {
    baseIdentity: "base",
    targetIdentity: "index",
    changedSourcePaths: ["src/a.ts"],
  },
};

test("renders stale acknowledgement snapshot provenance", () => {
  const output = renderDecision(
    {
      ...review,
      staleAcknowledgements: [
        {
          findingId: "finding",
          baseIdentity: "old-base",
          targetIdentity: "old-head",
        },
      ],
    },
    { json: false },
  );
  assert.match(output, /old-base/);
  assert.match(output, /current snapshot is base base and target index/);
});
