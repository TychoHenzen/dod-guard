import assert from "node:assert/strict";
import { test } from "node:test";
import { browserRequest, ownership } from "./browser-request.js";
import type { BrowserStorage } from "./session.js";

test("browser requests require and send one stored ownership pair", async (context) => {
  const values = new Map([
    ["browser_session_id", "session"],
    ["tab_instance_id", "tab"],
  ]);
  const storage: BrowserStorage = {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => values.set(key, value),
    clear: () => values.clear(),
  };
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  context.after(() => {
    if (originalFetch) Object.defineProperty(globalThis, "fetch", originalFetch);
    else Reflect.deleteProperty(globalThis, "fetch");
  });
  let headers: HeadersInit | undefined;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (_path: string, options: RequestInit) => {
      headers = options.headers;
      return { ok: true, json: async () => ({ state: "ready" }) };
    },
  });
  assert.deepEqual(ownership(storage), {
    "x-code-explorer-session": "session",
    "x-code-explorer-tab": "tab",
  });
  await browserRequest(storage, "/api/status", { action: "status" });
  assert.deepEqual(headers, {
    "content-type": "application/json",
    "x-code-explorer-session": "session",
    "x-code-explorer-tab": "tab",
  });
  values.clear();
  await assert.rejects(() => browserRequest(storage, "/api/status", {}), /invalid_browser_session/);
});
