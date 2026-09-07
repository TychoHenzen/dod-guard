import assert from "node:assert/strict";
import { it } from "node:test";
import { SessionManager } from "../../../navigation/session.js";

it(
  "rejects a closed connection's identifier from a new " + "connection",
  () => {
    const sessions = new SessionManager();
    const sessionId = sessions.start("old");
    sessions.closeConnection("old");
    assert.equal(
      sessions.execute(
        "new",
        sessionId,
        "request-identifier",
        "code_focus",
        {},
        async () => 1,
      ).state,
      "invalid_session",
    );
  },
);
