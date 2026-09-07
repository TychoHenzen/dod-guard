import assert from "node:assert/strict";
import { it } from "node:test";
import { sessionFixture } from "./session-fixture.js";
import { view } from "./view.js";

it("restores the next recorded view after moving back", () => {
  const { sessions, sessionId } = sessionFixture();
  const first = view();
  const second = view();
  sessions.addView("connection", sessionId, first);
  sessions.addView("connection", sessionId, second);
  sessions.restore("connection", sessionId, "back");
  assert.equal(sessions.restore("connection", sessionId, "forward"), second);
});
