import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveFirstHandle } from "./resolve-first-handle.js";
import { sessionFixture } from "./session-fixture.js";
import { view } from "./view.js";

it(
  "removes a connection's sessions, views, and handles when " + "it closes",
  () => {
    const { sessions, sessionId } = sessionFixture();
    const first = view();
    sessions.addView("connection", sessionId, first);
    sessions.closeConnection("connection");
    assert.deepEqual(resolveFirstHandle(sessions, sessionId, first), {
      state: "invalid_view_handle",
    });
  },
);
