import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSession, statusRequest } from "./session-fixture.js";
import { statusRouter } from "./status-router-fixture.js";

describe("browser HTTP boundary", () => {
  it("maps allowed navigation and redacted core errors", async () => {
    const router = statusRouter({ generation: 1, requireStatusName: true });
    const session = await createSession(router);
    const response = await statusRequest(router, session);
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).state, "ready");
  });
});
