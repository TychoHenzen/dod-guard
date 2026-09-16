import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionHarness as harness } from "../session-fixture.test.js";

describe("browser tab session", () => {
  it("restores only a reload with a prior tab session", async () => {
    const { client, storage, requests } = harness("reload");
    storage.browser_session_id = "old";
    storage.tab_instance_id = "tab";
    await client.start();
    assert.deepEqual(requests[0]?.body, {
      action: "restore",
      tab_instance_id: "tab",
      document_start: "reload",
    });
  });
  it("rotates copied identifiers for a navigation document", async () => {
    const { client, storage, requests } = harness("navigate");
    storage.browser_session_id = "copied";
    storage.tab_instance_id = "copied-tab";
    await client.start();
    assert.equal(requests[0]?.body.action, "create");
    assert.notEqual(requests[0]?.body.tab_instance_id, "copied-tab");
  });
  it("creates an independent server session for a second tab", async () => {
    const first = harness("navigate", { prefix: "first" });
    const second = harness("navigate", { prefix: "second" });
    await first.client.start();
    await second.client.start();
    assert.notEqual(
      first.storage.browser_session_id,
      second.storage.browser_session_id,
    );
    assert.notEqual(
      first.storage.tab_instance_id,
      second.storage.tab_instance_id,
    );
  });
  it("sends ownership headers from one stored pair only", async () => {
    const { client, storage, requests } = harness("reload");
    storage.browser_session_id = "owned";
    storage.tab_instance_id = "owned-tab";
    await client.start();
    assert.deepEqual(requests[0]?.headers, {
      "x-code-explorer-session": "owned",
      "x-code-explorer-tab": "owned-tab",
    });
  });
  it("rotates a reload that loses the old tab lock race", async () => {
    const { client, storage, requests } = harness("reload", {
      lockAvailable: false,
    });
    storage.browser_session_id = "old";
    storage.tab_instance_id = "old-tab";
    const result = await client.start();
    assert.equal(result.state, "browser_session_replaced");
    assert.equal(requests[0]?.body.action, "create");
    assert.notEqual(requests[0]?.body.tab_instance_id, "old-tab");
  });
});
