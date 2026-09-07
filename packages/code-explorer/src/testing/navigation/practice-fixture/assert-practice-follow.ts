import assert from "node:assert/strict";
import { createServer } from "../../../index.js";

export async function assertPracticeFollow(
  server: ReturnType<typeof createServer>,
  {
    sessionId,
    source,
    handle,
  }: { sessionId: string; source: { view_id: string }; handle: string },
) {
  const followed = await server.call("code_follow", {
    session_id: sessionId,
    request_id: "practice-follow-visible-0001",
    view_id: source.view_id,
    handle,
    relation: "definition",
  });
  assert.equal("code" in followed, false);
  if ("code" in followed) throw new Error("expected definition follow");
  assert.equal(
    (followed.data.focus as { symbol_id: string }).symbol_id.length > 0,
    true,
  );
}
