import assert from "node:assert/strict";
import { it } from "node:test";
import { executeFocus } from "./execute-focus.js";
import { sessionFixture } from "./session-fixture.js";

it(
  "serializes concurrent work for one session in accepted " + "order",
  async () => {
    const { sessions, sessionId } = sessionFixture();
    const observed: number[] = [];
    const first = executeFocus(sessions, {
      sessionId: sessionId,
      requestId: "request-identifier-1",
      arguments: {},
      operation: async () => observed.push(1),
    });
    const second = executeFocus(sessions, {
      sessionId: sessionId,
      requestId: "request-identifier-2",
      arguments: {},
      operation: async () => observed.push(2),
    });
    assert.equal(first.state, "ok");
    assert.equal(second.state, "ok");
    if (first.state !== "ok" || second.state !== "ok")
      throw new Error("expected queued work");
    assert.deepEqual(
      await Promise.all([first.response, second.response]),
      [1, 2],
    );
    assert.deepEqual(observed, [1, 2]);
  },
);
