import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../index.js";
import { startSession } from "./index-test-session-support.js";

it("refreshes only derived state and preserves view history", async () => {
  const server = createServer();
  const sessionId = await startSession(server);
  const before = server.state();
  const result = await server.call("code_status", {
    action: "refresh",
    session_id: sessionId,
    request_id: "refresh-request-0001",
  });
  assert.equal("code" in result, false);
  if ("code" in result) throw new Error("expected a successful refresh");
  assert.equal(result.state, "refreshed");
  assert.equal(
    server.state().refresh_generation,
    before.refresh_generation + 1,
  );
  assert.deepEqual(server.state().view_history, before.view_history);
});

it("reports only the aggregate sensitive exclusion count", async () => {
  const server = createServer({ sensitive_paths_excluded: 2 });
  const result = await server.call("code_status", { action: "status" });
  assert.equal("code" in result, false);
  if ("code" in result) throw new Error("expected status");
  assert.equal(
    (result.data as { sensitive_paths_excluded?: unknown })
      .sensitive_paths_excluded,
    2,
  );
  assert.deepEqual(
    (result.data as { backend_status?: { backends?: unknown } }).backend_status
      ?.backends,
    [],
  );
  assert.equal(JSON.stringify(result).includes(".env"), false);
});
