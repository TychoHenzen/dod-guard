import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";

it("releases an idle session before later request use", async () => {
  let now = 0;
  const server = createServer({ now: () => now });
  const started = await server.call("code_status", { action: "start_session" });
  if ("code" in started || typeof started.data.session_id !== "string")
    throw new Error("expected session");
  now = 30 * 60 * 1000;
  const result = await server.call("code_history", {
    session_id: started.data.session_id,
    request_id: "request-after-idle",
    action: "recent",
  });
  assert.deepEqual(result, {
    schema_version: 1,
    code: "invalid_session",
    message: "invalid_session",
    retryable: true,
  });
});
