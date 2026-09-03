import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserSessionClient } from "./session.js";

type Stored = Record<string, string>;
function harness(type: string, lockAvailable = true, prefix = "id") {
  const storage: Stored = {};
  const requests: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const client = new BrowserSessionClient({
    storage: {
      get: (key) => storage[key] ?? null,
      set: (key, value) => {
        storage[key] = value;
      },
      clear: () => {
        for (const key of Object.keys(storage)) delete storage[key];
      },
    },
    navigationType: () => type,
    lock: async (_name, action) => action(lockAvailable),
    randomId: (() => {
      let id = 0;
      return () => `${prefix}-${++id}`;
    })(),
    request: async (body, headers) => {
      requests.push({ body, headers });
      return { state: "created", data: { browser_session_id: `${prefix}-server` } };
    },
  });
  return { client, storage, requests };
}

describe("browser tab session", () => {
  it("restores only a reload with a prior tab session", async () => {
    const { client, storage, requests } = harness("reload");
    storage.browser_session_id = "old";
    storage.tab_instance_id = "tab";
    await client.start();
    assert.deepEqual(requests[0]?.body, { action: "restore", tab_instance_id: "tab", document_start: "reload" });
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
    const first = harness("navigate", true, "first");
    const second = harness("navigate", true, "second");
    await first.client.start();
    await second.client.start();
    assert.notEqual(first.storage.browser_session_id, second.storage.browser_session_id);
    assert.notEqual(first.storage.tab_instance_id, second.storage.tab_instance_id);
  });
  it("sends ownership headers from one stored pair only", async () => {
    const { client, storage, requests } = harness("reload");
    storage.browser_session_id = "owned";
    storage.tab_instance_id = "owned-tab";
    await client.start();
    assert.deepEqual(requests[0]?.headers, { "x-code-explorer-session": "owned", "x-code-explorer-tab": "owned-tab" });
  });
  it("rotates a reload that loses the old tab lock race", async () => {
    const { client, storage, requests } = harness("reload", false);
    storage.browser_session_id = "old";
    storage.tab_instance_id = "old-tab";
    const result = await client.start();
    assert.equal(result.state, "browser_session_replaced");
    assert.equal(requests[0]?.body.action, "create");
    assert.notEqual(requests[0]?.body.tab_instance_id, "old-tab");
  });
  it("fails closed when navigation timing or locks are unavailable", async () => {
    const { client, requests } = harness("");
    const result = await client.start();
    assert.equal(result.state, "browser_capability_unavailable");
    assert.equal(requests.length, 0);
  });
  it("replaces expired state with a new empty session", async () => {
    const { client, storage, requests } = harness("reload");
    storage.browser_session_id = "old";
    storage.tab_instance_id = "tab";
    await client.start();
    await client.recoverExpired();
    assert.equal(requests[1]?.body.action, "create");
    assert.notEqual(storage.browser_session_id, "old");
  });
  it("keeps stored identifiers during a normal accepted session", async () => {
    const { client, storage } = harness("reload");
    await client.start();
    const session = storage.browser_session_id;
    await client.start();
    assert.equal(storage.browser_session_id, session);
  });
  it("clears the previous identifiers before an expiry recovery creates a replacement", async () => {
    const { client, storage, requests } = harness("reload");
    storage.browser_session_id = "expired";
    storage.tab_instance_id = "expired-tab";
    await client.recoverExpired();
    assert.equal(requests[0]?.body.action, "create");
    assert.notEqual(storage.browser_session_id, "expired");
    assert.notEqual(storage.tab_instance_id, "expired-tab");
  });
});
