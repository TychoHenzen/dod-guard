import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveFirstHandle } from "./resolve-first-handle.js";
import { sessionFixture } from "./session-fixture.js";
import { view } from "./view.js";

it(
  "replaces the abandoned forward branch when a new view " + "follows back",
  () => {
    const { sessions, sessionId } = sessionFixture();
    const first = view();
    const abandoned = view();
    const replacement = view();
    sessions.addView("connection", sessionId, first);
    sessions.addView("connection", sessionId, abandoned);
    sessions.restore("connection", sessionId, "back");
    sessions.addView("connection", sessionId, replacement);
    assert.deepEqual(sessions.history("connection", sessionId), [
      first.view_id,
      replacement.view_id,
    ]);
    assert.deepEqual(resolveFirstHandle(sessions, sessionId, abandoned), {
      state: "stale_view",
    });
  },
);
