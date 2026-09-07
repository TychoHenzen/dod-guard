import assert from "node:assert/strict";
import { createServer } from "../../../index.js";
import { evictPracticeViews } from "./evict-practice-views.js";

export async function assertEvictedPracticeHandle(
  server: ReturnType<typeof createServer>,
  {
    sessionId,
    source,
    handle,
  }: { sessionId: string; source: { view_id: string }; handle: string },
) {
  await evictPracticeViews(server, sessionId);
  const stale = await server.call("code_follow", {
    session_id: sessionId,
    request_id: "practice-stale-handle-0001",
    view_id: source.view_id,
    handle,
    relation: "definition",
  });
  assert.deepEqual(stale, {
    schema_version: 1,
    code: "stale_view",
    message: "stale_view",
    retryable: false,
  });
}
