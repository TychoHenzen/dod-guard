type GlobalName = "document" | "fetch" | "sessionStorage" | "navigator" | "performance" | "crypto" | "window";

function restoreGlobal(name: GlobalName, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

export function installClientFixture() {
  const globals: readonly GlobalName[] = [
    "document",
    "fetch",
    "sessionStorage",
    "navigator",
    "performance",
    "crypto",
    "window",
  ];
  const originals = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const attributes = new Map<string, string>();
  const stored = new Map<string, string>();
  const requests: Array<{ path: string; options: RequestInit }> = [];
  const root = {
    textContent: "",
    innerHTML: "",
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      querySelector: (selector: string) => (selector === "#code-explorer" ? root : null),
      querySelectorAll: () => [],
    },
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1280 } });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (path: string, options: RequestInit) => {
      requests.push({ path, options });
      if (path === "/api/status" || path === "/api/search") return await new Promise<Response>(() => {});
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
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => "tab-id" } });
  return {
    attributes,
    requests,
    root,
    restore: () => {
      for (const [name, descriptor] of originals) restoreGlobal(name, descriptor);
    },
  };
}
