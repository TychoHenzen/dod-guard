import assert from "node:assert/strict";
import { it } from "node:test";
import { startSession } from "../support/start-session.js";
import { historyGenerationFixture } from "./history-generation-fixture.js";

it(
  "restores an old immutable view with its original " +
    "generation and stale label",
  async () => {
    const { freshness, server } = historyGenerationFixture();
    const sessionId = await startSession(server);
    const first = await server.call("code_focus", {
      session_id: sessionId,
      request_id: "focus-request-0001",
      symbol_id: "backend-id",
    });
    if ("code" in first) throw new Error("expected first focus");
    await freshness.reconcile();
    await server.call("code_focus", {
      session_id: sessionId,
      request_id: "focus-request-0002",
      symbol_id: "backend-id",
    });
    const restored = await server.call("code_history", {
      session_id: sessionId,
      request_id: "history-request-0001",
      action: "back",
    });
    if ("code" in restored) throw new Error("expected restored view");
    assert.equal(restored.project_generation, 2);
    assert.equal(restored.data.project_generation, 1);
    assert.equal(restored.data.stale, true);
  },
);
