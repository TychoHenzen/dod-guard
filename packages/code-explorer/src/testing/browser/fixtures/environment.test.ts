import { replaceGlobal } from "./globals.test.js";

export function installClientEnvironment(stored: Map<string, string>) {
  const restores = [
    replaceGlobal("window", { innerWidth: 1280 }),
    replaceGlobal("navigator", { locks: { request: lockRequest } }),
    replaceGlobal("performance", {
      getEntriesByType: () => [{ type: "navigate" }],
    }),
    replaceGlobal("crypto", { randomUUID: () => "tab-id" }),
    replaceGlobal("sessionStorage", sessionStorage(stored)),
  ];
  return () => { for (const restore of restores) restore(); };
}

async function lockRequest(
  _name: string, _options: unknown, action: (lock: object) => unknown,
) {
  return action({});
}

function sessionStorage(stored: Map<string, string>) {
  return {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  };
}
