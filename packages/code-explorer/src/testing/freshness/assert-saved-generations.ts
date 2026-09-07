import assert from "node:assert/strict";
import { WorkspaceFreshness } from "../../freshness/workspace-freshness.js";
import { manifest } from "./workspace-freshness/manifest.js";

export async function assertSavedGenerations() {
  const manifests = [
    manifest({ "src/old.ts": "one" }),
    manifest({ "src/renamed.ts": "two" }),
    manifest({}),
    manifest({ "src/final.ts": "three" }),
  ];
  const freshness = new WorkspaceFreshness({
    reconcile: async () =>
      manifests.shift() ?? manifest({ "src/final.ts": "three" }),
  });
  await freshness.start();
  assert.deepEqual(freshness.status(), {
    current_generation: 1,
    pending_generation: null,
    state: "ready",
    mode: "watching",
  });
  await freshness.reconcile();
  assert.equal(freshness.status().current_generation, 2); // rename
  await freshness.reconcile();
  assert.equal(freshness.status().current_generation, 3); // delete
  return { freshness };
}
