import assert from "node:assert/strict";
import { test } from "node:test";

test("reports the browser server state in the application root", async (context) => {
  const globals = ["document", "fetch", "sessionStorage", "navigator", "performance", "crypto"] as const;
  const originals = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  context.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  const attributes = new Map<string, string>();
  const stored = new Map<string, string>();
  const requests: Array<{ path: string; options: RequestInit }> = [];
  const root = {
    textContent: "",
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { querySelector: () => root },
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (path: string, options: RequestInit) => {
      requests.push({ path, options });
      if (path === "/api/status") return await new Promise<Response>(() => {});
      return { ok: true, json: async () => ({ state: "created", data: { browser_session_id: "browser-session" } }) };
    },
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: { request: async (_name: string, _options: unknown, action: (lock: object) => unknown) => action({}) },
    },
  });
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { getEntriesByType: () => [{ type: "navigate" }] },
  });
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => "tab-id" },
  });

  const modulePath = `./client.js?test=${Date.now()}`;
  await import(modulePath);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(root.textContent, "Code Explorer: created");
  assert.equal(attributes.get("data-state"), "ready");
  assert.deepEqual(
    requests.map(({ path }) => path),
    ["/api/session", "/api/status"],
  );
  assert.deepEqual(requests[1]?.options.headers, {
    "content-type": "application/json",
    "x-code-explorer-session": "browser-session",
    "x-code-explorer-tab": "tab-id",
  });
});
