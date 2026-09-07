import assert from "node:assert/strict";
import { it } from "node:test";
import { SessionManager } from "../../../navigation/session.js";
import { resolveFirstHandle } from "./resolve-first-handle.js";
import { view } from "./view.js";

it(
  "evicts eligible views before rejecting a retained-body " +
    "allocation that cannot fit",
  () => {
    const evicting = new SessionManager({ maxRetainedBodyBytes: 8 });
    const evictingSession = evicting.start("evicting");
    const first = view();
    const eligible = view();
    const replacement = view();
    evicting.addView("evicting", evictingSession, first);
    evicting.addView("evicting", evictingSession, eligible);
    evicting.restore("evicting", evictingSession, "back");
    assert.equal(
      evicting.addView("evicting", evictingSession, replacement),
      "ok",
    );
    assert.deepEqual(
      evicting.resolveHandle(
        "evicting",
        evictingSession,
        eligible.view_id,
        eligible.handles[0].handle,
      ),
      {
        state: "stale_view",
      },
    );

    const sessions = new SessionManager({ maxRetainedBodyBytes: 4 });
    const sessionId = sessions.start("connection");
    const current = view();
    const next = view();
    assert.equal(sessions.addView("connection", sessionId, current), "ok");
    assert.equal(
      sessions.addView("connection", sessionId, next),
      "project_capacity",
    );
    assert.deepEqual(resolveFirstHandle(sessions, sessionId, current), {
      state: "ok",
      symbolId: "target",
    });
  },
);
