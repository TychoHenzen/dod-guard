import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { origin } from "./origin-fixture.js";
import { request } from "./request-fixture.js";

describe("browser HTTP boundary", () => {
  it(
    "applies the fixed policy that keeps source and labels " +
      "out of executable attributes",
    async () => {
      const router = new BrowserHttpRouter({
        origin,
        call: async () => ({ schema_version: 1 }),
      });
      const response = await request(router, {
        path: "/api/write",
        body: "<script>alert(1)</script>",
      });
      assert.equal(
        response.headers["content-security-policy"],
        "default-src 'none'; script-src 'self'; style-src 'self'; " +
          "img-src 'self' data:; connect-src 'self'; base-uri 'none'; " +
          "form-action 'none'; frame-ancestors 'none'; object-src 'none'",
      );
      assert.equal(response.body.includes("<script>"), false);
    },
  );
  it(
    "does not echo source-shaped request text into an " + "executable response",
    async () => {
      const router = new BrowserHttpRouter({
        origin,
        call: async () => ({ schema_version: 1 }),
      });
      const response = await request(router, {
        path: "/api/write",
        body: "<script>window.pwned=true</script>",
      });
      assert.equal(response.body.includes("window.pwned"), false);
      assert.equal(
        response.headers["content-security-policy"]?.includes(
          "script-src 'self'",
        ),
        true,
      );
    },
  );
});
