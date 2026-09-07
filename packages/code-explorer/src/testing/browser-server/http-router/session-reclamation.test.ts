import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { origin } from "./origin-fixture.js";
import { tabRequest } from "./session-fixture.js";

describe("browser HTTP boundary", () => {
  it(
    "reclaims expired sessions before " + "admitting a replacement tab",
    async () => {
      let now = 0;
      const router = new BrowserHttpRouter({
        origin,
        clock: { nowMilliseconds: () => now },
        call: async (_name: string, arguments_: Record<string, unknown>) => ({
          schema_version: 1,
          state: "ready",
          data: { session_id: `core-${String(arguments_.action)}` },
        }),
      });
      for (let index = 0; index < 8; index += 1) {
        const tab = `tab-${index}`;
        const created = await tabRequest(router, tab);
        assert.equal(created.status, 200);
      }
      now = 30 * 60 * 1000;
      const replacement = await tabRequest(router, "replacement");
      assert.equal(replacement.status, 200);
    },
  );
});
