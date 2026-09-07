import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { origin } from "./origin-fixture.js";
import { request } from "./request-fixture.js";

describe("browser HTTP boundary", () => {
  it("rejects unknown closed-body fields", async () => {
    const router = new BrowserHttpRouter({
      origin,
      call: async () => ({ schema_version: 1 }),
    });
    const response = await request(router, {
      body: JSON.stringify({
        action: "create",
        tab_instance_id: "tab",
        document_start: "new",
        extra: true,
      }),
    });
    assert.equal(response.status, 400);
    assert.equal(JSON.parse(response.body).code, "invalid_request");
  });
  it("counts API bytes before JSON decoding", async () => {
    const router = new BrowserHttpRouter({
      origin,
      call: async () => ({ schema_version: 1 }),
    });
    const prefix = '{"action":"status","pad":"';
    const suffix = '"}';
    const padding =
      65_536 - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
    const allowed = await request(router, {
      path: "/api/status",
      body: `${prefix}${"x".repeat(padding)}${suffix}`,
    });
    const rejected = await request(router, {
      path: "/api/status",
      body: "x".repeat(65_537),
    });
    assert.equal(allowed.status, 400);
    assert.equal(rejected.status, 413);
  });
  it("returns resource_limit for a body larger " + "than 64 KiB", async () => {
    const router = new BrowserHttpRouter({
      origin,
      call: async () => ({ schema_version: 1 }),
    });
    const response = await request(router, {
      path: "/api/status",
      body: "x".repeat(65_537),
    });
    assert.equal(response.status, 413);
    assert.equal(JSON.parse(response.body).code, "resource_limit");
  });
});
