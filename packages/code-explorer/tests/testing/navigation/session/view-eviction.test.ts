import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveFirstHandle } from "./resolve-first-handle.js";
import { sessionFixture } from "./session-fixture.js";
import { view } from "./view.js";

it(
  "evicts the oldest non-current retained view and marks " +
    "its handles stale",
  () => {
    const { sessions, sessionId } = sessionFixture();
    const views = Array.from({ length: 65 }, () => view());
    for (const candidate of views)
      sessions.addView("connection", sessionId, candidate);
    assert.equal(sessions.history("connection", sessionId)?.length, 64);
    assert.deepEqual(resolveFirstHandle(sessions, sessionId, views[0]), {
      state: "stale_view",
    });
    assert.deepEqual(resolveFirstHandle(sessions, sessionId, views[64]), {
      state: "ok",
      symbolId: "target",
    });
  },
);
