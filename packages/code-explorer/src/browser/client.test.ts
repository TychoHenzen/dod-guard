import assert from "node:assert/strict";
import { test } from "node:test";

test("reports the browser server state in the application root", async (context) => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  context.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (originalFetch) Object.defineProperty(globalThis, "fetch", originalFetch);
    else Reflect.deleteProperty(globalThis, "fetch");
  });

  const attributes = new Map<string, string>();
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
    value: async () => ({ ok: true, json: async () => ({ state: "ready" }) }),
  });

  const modulePath = `./client.js?test=${Date.now()}`;
  await import(modulePath);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(root.textContent, "Code Explorer: ready");
  assert.equal(attributes.get("data-state"), "ready");
});
