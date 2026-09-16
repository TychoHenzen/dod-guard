import assert from "node:assert/strict";
import { it } from "node:test";
import { executeFocus } from "./execute-focus.js";
import { sessionFixture } from "./session-fixture.js";

it(
  "replays retained completed responses without another " + "operation",
  async () => {
    const { sessions, sessionId } = sessionFixture();
    let operations = 0;
    const one = executeFocus(sessions, {
      sessionId: sessionId,
      requestId: "request-identifier",
      arguments: { symbol_id: "one" },
      operation: async () => ++operations,
    });
    const two = executeFocus(sessions, {
      sessionId: sessionId,
      requestId: "request-identifier",
      arguments: { symbol_id: "one" },
      operation: async () => ++operations,
    });
    if (one.state !== "ok" || two.state !== "ok")
      throw new Error("expected replay");
    assert.deepEqual(await Promise.all([one.response, two.response]), [1, 1]);
    assert.equal(operations, 1);
  },
);
