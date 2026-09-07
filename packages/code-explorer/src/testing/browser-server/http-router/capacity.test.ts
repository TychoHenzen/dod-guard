import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { origin } from "./origin-fixture.js";
import { request } from "./request-fixture.js";

describe("browser HTTP boundary", () => {
  it("returns stable capacity errors", async () => {
    const router = new BrowserHttpRouter({
      origin,
      maxSessions: 0,
      call: async () => ({ schema_version: 1 }),
    });
    const response = await request(router, {});
    assert.equal(response.status, 429);
    assert.equal(JSON.parse(response.body).code, "project_capacity");
  });
  it(
    "rejects a complete request when the HTTP in-flight " +
      "capacity is reached",
    async () => {
      const router = new BrowserHttpRouter({
        origin,
        maxInFlight: 0,
        call: async () => ({ schema_version: 1 }),
      });
      const response = await request(router, {});
      assert.equal(response.status, 429);
      assert.equal(JSON.parse(response.body).code, "http_capacity");
    },
  );
});
