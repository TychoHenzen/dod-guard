import assert from "node:assert/strict";
import * as generations from "../../freshness/project-generation-scheduler.js";
import { WorkspaceFreshness } from "../../freshness/workspace-freshness.js";

export async function assertFailedRetention(
  scheduler: generations.ProjectGenerationScheduler,
  freshness: WorkspaceFreshness,
) {
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
  return { retained };
}
