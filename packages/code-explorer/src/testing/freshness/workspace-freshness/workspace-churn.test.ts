import assert from "node:assert/strict";
import { it } from "node:test";
import { WorkspaceFreshness } from "../../../freshness/workspace-freshness.js";
import { manifest } from "./manifest.js";

it(
  "discards mismatched manifests and preserves the prior " +
    "generation after repeated churn",
  async () => {
    const manifests = [
      manifest({ "src/a.ts": "one" }),
      manifest({ "src/a.ts": "two" }),
      manifest({ "src/a.ts": "three" }),
      manifest({ "src/a.ts": "four" }),
    ];
    const verified = [
      manifest({ "src/a.ts": "one" }),
      manifest({ "src/a.ts": "two-prime" }),
      manifest({ "src/a.ts": "three-prime" }),
      manifest({ "src/a.ts": "four-prime" }),
    ];
    const freshness = new WorkspaceFreshness({
      reconcile: async () =>
        manifests.shift() ?? manifest({ "src/a.ts": "missing" }),
      verify: async () =>
        verified.shift() ?? manifest({ "src/a.ts": "missing-prime" }),
    });
    await freshness.start();
    const prior = freshness.status().current_generation;
    await freshness.reconcile();
    assert.deepEqual(freshness.status(), {
      current_generation: prior,
      pending_generation: null,
      state: "degraded",
      mode: "watching",
      degraded_cause: "workspace_churn",
    });
  },
);
