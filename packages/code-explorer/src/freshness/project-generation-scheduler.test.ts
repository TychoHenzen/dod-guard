import assert from "node:assert/strict";
import { it } from "node:test";
import { ProjectGenerationScheduler } from "./project-generation-scheduler.js";
import { type ReconcileResult, WorkspaceFreshness } from "./workspace-freshness.js";

function manifest(value: string): ReconcileResult {
  return { manifest: new Map([["src/a.ts", value]]) };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => (resolve = done)), resolve };
}
it("coalesces concurrent session refreshes into one globally ordered publication", async () => {
  const manifests = [manifest("one"), manifest("two")];
  const freshness = new WorkspaceFreshness({ reconcile: async () => manifests.shift() ?? manifest("two") });
  await freshness.start();
  const scheduler = new ProjectGenerationScheduler(freshness);
  const work = deferred();
  let calls = 0;
  const refresh = () => {
    calls += 1;
    return work.promise;
  };
  const first = scheduler.refresh(refresh);
  const second = scheduler.refresh(refresh);
  assert.equal(first, second);
  work.resolve();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(left, right);
  assert.equal(left.pending_generation, null);
});
it("captures current and pending generations in FIFO accepted-request order", async () => {
  const pending = deferred();
  let analyses = 0;
  const manifests = [manifest("one"), manifest("two")];
  const freshness = new WorkspaceFreshness({
    reconcile: async () => manifests.shift() ?? manifest("two"),
    analyze: async (_generation) => {
      analyses += 1;
      if (analyses > 1) await pending.promise;
    },
  });
  await freshness.start();
  const scheduler = new ProjectGenerationScheduler(freshness);
  const refresh = scheduler.refresh(async () => undefined);
  const search = scheduler.accept();
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
  assert.equal(freshness.status().pending_generation, 2);
  pending.resolve();
  await refresh;
  const accepted = await search;
  assert.equal(accepted.status.current_generation, 2);
  assert.equal(accepted.status.pending_generation, null);
});
