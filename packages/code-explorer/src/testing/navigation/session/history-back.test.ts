import assert from "node:assert/strict";
import { it } from "node:test";
import { sessionFixture } from "./session-fixture.js";
import { view } from "./view.js";

it("restores the prior focused view with its original handles", () => {
  const { sessions, sessionId } = sessionFixture();
  const first = view();
  const second = view();
  sessions.addView("connection", sessionId, first);
  sessions.addView("connection", sessionId, second);
  const restored = sessions.restore("connection", sessionId, "back");
  assert.equal(restored, first);
  assert.equal(restored?.handles[0]?.handle, first.handles[0]?.handle);
});
