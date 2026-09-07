import assert from "node:assert/strict";
import { it } from "node:test";
import { executeFocus } from "./execute-focus.js";
import { sessionFixture } from "./session-fixture.js";

it(
  "accepts an identifier as new work after its retention " + "expires",
  async () => {
    const { sessions, sessionId } = sessionFixture();
    const one = executeFocus(sessions, {
      sessionId: sessionId,
      requestId: "request-identifier",
      arguments: {},
      operation: async () => 1,
      now: 0,
    });
    if (one.state !== "ok") throw new Error("expected work");
    await one.response;
    const two = executeFocus(sessions, {
      sessionId: sessionId,
      requestId: "request-identifier",
      arguments: {},
      operation: async () => 2,
      now: 300_001,
    });
    if (two.state !== "ok") throw new Error("expected renewed work");
    assert.equal(await two.response, 2);
  },
);
