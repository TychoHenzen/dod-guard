import assert from "node:assert/strict";
import { it } from "node:test";
import { executeFocus } from "./execute-focus.js";
import { sessionFixture } from "./session-fixture.js";

it("joins an in-flight duplicate without another queue slot", async () => {
  const { sessions, sessionId } = sessionFixture();
  let release: (() => void) | undefined;
  let operations = 0;
  const wait = new Promise<void>((resolve) => (release = resolve));
  const one = executeFocus(sessions, {
    sessionId: sessionId,
    requestId: "request-identifier",
    arguments: { symbol_id: "one" },
    operation: async () => {
      operations += 1;
      await wait;
      return 7;
    },
  });
  const two = executeFocus(sessions, {
    sessionId: sessionId,
    requestId: "request-identifier",
    arguments: { symbol_id: "one" },
    operation: async () => 8,
  });
  if (one.state !== "ok" || two.state !== "ok")
    throw new Error("expected replay");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(operations, 1);
  release?.();
  assert.deepEqual(await Promise.all([one.response, two.response]), [7, 7]);
});
