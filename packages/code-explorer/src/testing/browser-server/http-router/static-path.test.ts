import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { origin } from "./origin-fixture.js";
import { request } from "./request-fixture.js";

const assetRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "browser",
);

describe("browser HTTP boundary", () => {
  it(
    "rejects static traversal without " + "exposing a local path",
    async () => {
      const router = new BrowserHttpRouter({
        origin,
        assetRoot,
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

  it("serves only the packaged static assets", async () => {
    const router = new BrowserHttpRouter({
      origin,
      assetRoot,
      call: async () => ({ schema_version: 1 }),
    });
    const known = await request(router, {
      method: "GET",
      path: "/client.js?cache=1",
      headers: { origin: undefined },
    });
    const unknown = await request(router, {
      method: "GET",
      path: "/package.json",
      headers: { origin: undefined },
    });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 404);
  });
});
