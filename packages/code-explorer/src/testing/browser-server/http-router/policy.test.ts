import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { countingRouter } from "./counting-router-fixture.js";
import { origin } from "./origin-fixture.js";
import { request } from "./request-fixture.js";

describe("browser HTTP boundary", () => {
  it(
    "rejects unadvertised write routes before " + "core dispatch",
    async () => {
      const fixture = countingRouter();
      const router = fixture.router;
      const response = await request(router, { path: "/api/write" });
      assert.equal(response.status, 404);
      assert.equal(fixture.calls(), 0);
    },
  );
  it("does not grant CORS preflight", async () => {
    const router = new BrowserHttpRouter({
      origin,
      call: async () => ({ schema_version: 1 }),
    });
    const response = await request(router, {
      method: "OPTIONS",
      path: "/api/search",
    });
    assert.equal(response.status, 405);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
  });
  it("rejects wrong authority before session work", async () => {
    const fixture = countingRouter();
    const router = fixture.router;
    const response = await request(router, {
      headers: { host: "localhost:4410" },
    });
    assert.equal(response.status, 403);
    assert.equal(JSON.parse(response.body).code, "invalid_browser_origin");
    assert.equal(fixture.calls(), 0);
  });
});
