import assert from "node:assert/strict";
import { it } from "node:test";
import { SessionManager } from "../../../navigation/session.js";
import { resolveFirstHandle } from "./resolve-first-handle.js";
import { view } from "./view.js";

it(
  "resolves a visible handle only from its immutable " + "issuing view",
  () => {
    const sessions = new SessionManager();
    const sessionId = sessions.tryStart("connection", 0);
    if (!sessionId) throw new Error("expected session");
    const first = view();
    assert.equal(sessions.addView("connection", sessionId, first), "ok");
    assert.deepEqual(resolveFirstHandle(sessions, sessionId, first), {
      state: "ok",
      symbolId: "target",
    });
    const result = view();
    assert.equal(sessions.addView("connection", sessionId, result), "ok");
    assert.notEqual(result.view_id, first.view_id);
  },
);
