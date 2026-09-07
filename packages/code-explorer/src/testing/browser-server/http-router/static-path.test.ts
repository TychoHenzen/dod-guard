import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { origin } from "./origin-fixture.js";
import { request } from "./request-fixture.js";

describe("browser HTTP boundary", () => {
  it(
    "rejects static traversal without " + "exposing a local path",
    async () => {
      const router = new BrowserHttpRouter({
        origin,
        call: async () => ({ schema_version: 1 }),
      });
      const response = await request(router, {
        method: "GET",
        path: "/%2e%2e/package.json",
        headers: { origin: undefined },
      });
      assert.equal(response.status, 404);
      assert.equal(response.body.includes("package.json"), false);
    },
  );
});
