import assert from "node:assert/strict";
import { createServer } from "../../../index.js";

export async function assertPracticeHistory(
  server: ReturnType<typeof createServer>,
  sessionId: string,
  source: { view_id: string },
) {
  const back = await server.call("code_history", {
    session_id: sessionId,
    request_id: "practice-history-back-0001",
    action: "back",
  });
  const forward = await server.call("code_history", {
    session_id: sessionId,
    request_id: "practice-history-forward-01",
    action: "forward",
  });
  assert.equal("code" in back, false);
  assert.equal("code" in forward, false);
  if ("code" in back || "code" in forward)
    throw new Error("expected history restore");
  assert.equal(back.data.view_id, source.view_id);
  assert.notEqual(forward.data.view_id, source.view_id);
}
