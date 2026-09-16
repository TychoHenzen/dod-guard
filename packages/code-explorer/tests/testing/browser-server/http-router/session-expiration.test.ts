import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSession, statusRequest } from "./session-fixture.js";
import { statusRouter } from "./status-router-fixture.js";

describe("browser HTTP boundary", () => {
  it(
    "does not reveal another tab session and expires at the " +
      "exact monotonic boundary",
    async () => {
      let now = 0;
      const router = statusRouter({ generation: 0, now: () => now });
      const session = await createSession(router);
      const rejected = await statusRequest(router, session, "other");
      assert.equal(JSON.parse(rejected.body).code, "invalid_browser_session");
      now = 1_800_000;
      const expired = await statusRequest(router, session);
      assert.equal(expired.status, 410);
      assert.equal(JSON.parse(expired.body).code, "browser_session_expired");
    },
  );
});
