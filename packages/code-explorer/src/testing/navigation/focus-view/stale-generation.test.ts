import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { startSession } from "../support/start-session.js";
import { changingFreshness } from "./changing-freshness.js";
import { focusOldView } from "./focus-old-view.js";
import { observedFocusAdapter } from "./observed-focus-adapter.js";

it(
  "returns stale_view generations without dispatching " +
    "semantics for an old view",
  async () => {
    const { freshness } = changingFreshness();
    let requests = 0;
    const adapter = observedFocusAdapter(() => {
      requests += 1;
    });
    const server = createServer({ adapters: [adapter], freshness });
    const sessionId = await startSession(server);
    const { view } = await focusOldView(server, sessionId);
    await freshness.reconcile();
    const followed = await server.call("code_follow", {
      session_id: sessionId,
      request_id: "follow-request-0001",
      view_id: view.view_id,
      handle: view.handles[0]?.handle ?? "missing",
      relation: "definition",
    });
    assert.deepEqual(followed, {
      schema_version: 1,
      code: "stale_view",
      message: "stale_view",
      retryable: false,
      details: { view_generation: 1, current_generation: 2 },
    });
    assert.equal(requests, 1);
  },
);
