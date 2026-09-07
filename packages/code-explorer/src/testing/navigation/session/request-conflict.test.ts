import assert from "node:assert/strict";
import { it } from "node:test";
import { canonicalFingerprint } from "../../../navigation/session.js";
import { executeFocus } from "./execute-focus.js";
import { sessionFixture } from "./session-fixture.js";

it(
  "rejects a retained identifier whose canonical request " + "differs",
  async () => {
    const { sessions, sessionId } = sessionFixture();
    const one = executeFocus(sessions, {
      sessionId: sessionId,
      requestId: "request-identifier",
      arguments: { nested: { b: 2, a: 1 } },
      operation: async () => 1,
    });
    if (one.state !== "ok") throw new Error("expected work");
    await one.response;
    assert.equal(
      executeFocus(sessions, {
        sessionId: sessionId,
        requestId: "request-identifier",
        arguments: { nested: { a: 1, b: 3 } },
        operation: async () => 2,
      }).state,
      "request_id_conflict",
    );
    assert.equal(
      canonicalFingerprint("code_focus", {
        request_id: "first",
        nested: { b: 2, a: 1 },
      }),
      canonicalFingerprint("code_focus", {
        request_id: "second",
        nested: { a: 1, b: 2 },
      }),
    );
  },
);
