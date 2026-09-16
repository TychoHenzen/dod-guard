import assert from "node:assert/strict";
import { it } from "node:test";
import { sessionFixture } from "./session-fixture.js";
import { view } from "./view.js";

it("does not resolve handles through another or missing view", () => {
  const { sessions, sessionId } = sessionFixture();
  const first = view();
  const other = view();
  sessions.addView("connection", sessionId, first);
  sessions.addView("connection", sessionId, other);
  assert.deepEqual(
    sessions.resolveHandle(
      "connection",
      sessionId,
      other.view_id,
      first.handles[0].handle,
    ),
    {
      state: "invalid_view_handle",
    },
  );
  assert.deepEqual(
    sessions.resolveHandle(
      "connection",
      sessionId,
      "expired",
      first.handles[0].handle,
    ),
    {
      state: "invalid_view_handle",
    },
  );
});
