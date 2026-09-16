import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionHarness as harness } from "../session-fixture.test.js";

describe("browser tab session", () => {
  it(
    "fails closed when navigation " + "timing or locks are unavailable",
    async () => {
      const { client, requests } = harness("");
      const result = await client.start();
      assert.equal(result.state, "browser_capability_unavailable");
      assert.equal(requests.length, 0);
    },
  );
  it("replaces expired state with a new empty session", async () => {
    const { client, storage, requests } = harness("reload");
    storage.browser_session_id = "old";
    storage.tab_instance_id = "tab";
    await client.start();
    await client.recoverExpired();
    assert.equal(requests[1]?.body.action, "create");
    assert.notEqual(storage.browser_session_id, "old");
  });
  it(
    "replaces a session lost when " + "the browser server restarted",
    async () => {
      const { client, storage, requests } = harness("reload", {
        restoreState: "invalid_browser_session",
      });
      storage.browser_session_id = "old";
      storage.tab_instance_id = "tab";

      const result = await client.start();

      assert.equal(result.state, "browser_session_expired");
      assert.equal(requests[1]?.body.action, "create");
      assert.notEqual(storage.browser_session_id, "old");
    },
  );
  it(
    "keeps stored identifiers " + "during a normal accepted session",
    async () => {
      const { client, storage } = harness("reload");
      await client.start();
      const session = storage.browser_session_id;
      await client.start();
      assert.equal(storage.browser_session_id, session);
    },
  );
  it(
    "clears the previous identifiers before " +
      "an expiry recovery creates a replacement",
    async () => {
      const { client, storage, requests } = harness("reload");
      storage.browser_session_id = "expired";
      storage.tab_instance_id = "expired-tab";
      await client.recoverExpired();
      assert.equal(requests[0]?.body.action, "create");
      assert.notEqual(storage.browser_session_id, "expired");
      assert.notEqual(storage.tab_instance_id, "expired-tab");
    },
  );
});
