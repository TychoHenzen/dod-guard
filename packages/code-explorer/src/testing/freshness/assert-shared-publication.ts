import assert from "node:assert/strict";
import * as generations from "../../freshness/project-generation-scheduler.js";
import { WorkspaceFreshness } from "../../freshness/workspace-freshness.js";
import { deferred } from "./workspace-freshness/deferred.js";

export async function assertSharedPublication(
  scheduler: generations.ProjectGenerationScheduler,
  freshness: WorkspaceFreshness,
) {
  const pending = deferred<void>();
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
  assert.deepEqual(published, {
    current_generation: 4,
    pending_generation: null,
    state: "ready",
    mode: "watching",
  });
}
