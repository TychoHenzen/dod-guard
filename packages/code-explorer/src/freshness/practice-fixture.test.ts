import assert from "node:assert/strict";
import { it } from "node:test";
import { ProjectGenerationScheduler } from "./project-generation-scheduler.js";
import { type ReconcileResult, WorkspaceFreshness } from "./workspace-freshness.js";

function manifest(paths: Record<string, string>): ReconcileResult {
  return { manifest: new Map(Object.entries(paths)) };
}
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  return { promise: new Promise((done) => (resolve = done)), resolve };
}

it("runs the one-process freshness practice fixture through changes, shared refresh, publication, and failed-refresh retention", async () => {
  const manifests = [
    manifest({ "src/old.ts": "one" }),
    manifest({ "src/renamed.ts": "two" }),
    manifest({}),
    manifest({ "src/final.ts": "three" }),
  ];
  const freshness = new WorkspaceFreshness({
    reconcile: async () => manifests.shift() ?? manifest({ "src/final.ts": "three" }),
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

  const scheduler = new ProjectGenerationScheduler(freshness);
  const pending = deferred();
  const first = scheduler.refresh(async () => pending.promise);
  const second = scheduler.refresh(async () => pending.promise);
  assert.equal(first, second);
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  assert.deepEqual(freshness.status(), {
    current_generation: 3,
    pending_generation: 4,
    state: "refreshing",
    mode: "watching",
  });
  pending.resolve();
  const published = await first;
  assert.deepEqual(published, { current_generation: 4, pending_generation: null, state: "ready", mode: "watching" });

  const retained = freshness.status().current_generation;
  const failed = await scheduler.refresh(async () => {
    throw new Error("fixture backend unavailable");
  });
  assert.deepEqual(failed, {
    current_generation: retained,
    pending_generation: null,
    state: "refresh_failed",
    mode: "watching",
  });
  console.log(
    JSON.stringify({
      save_rename_delete: [1, 2, 3],
      pending_analysis: 4,
      concurrent_sessions: "coalesced",
      successful_refresh: 4,
      failed_refresh_retained: retained,
    }),
  );
});
