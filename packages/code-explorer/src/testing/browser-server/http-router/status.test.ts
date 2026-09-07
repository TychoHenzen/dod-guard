import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { origin } from "./origin-fixture.js";
import { request } from "./request-fixture.js";
import { createSession, statusRequest } from "./session-fixture.js";
import { statusRouter } from "./status-router-fixture.js";

describe("browser HTTP boundary", () => {
  it(
    "preserves a successful status envelope " + "from the shared core",
    async () => {
      const router = statusRouter({
        generation: 4,
        pending: 5,
        statusData: { workspace: "ready" },
      });
      const browserSession = await createSession(router);
      const response = await statusRequest(router, browserSession);
      assert.deepEqual(JSON.parse(response.body), {
        schema_version: 1,
        project_id: "p",
        project_generation: 4,
        pending_generation: 5,
        state: "ready",
        data: { workspace: "ready" },
      });
    },
  );
  it(
    "preserves degraded root access when creating a browser " + "session",
    async () => {
      const router = new BrowserHttpRouter({
        origin,
        call: async () => ({
          schema_version: 1,
          state: "degraded",
          data: { session_id: "core", root_access: "root_access_denied" },
        }),
      });
      const created = JSON.parse((await request(router, {})).body);
      assert.equal(created.state, "degraded");
      assert.equal(created.data.root_access, "root_access_denied");
      assert.equal(typeof created.data.browser_session_id, "string");
    },
  );
});
