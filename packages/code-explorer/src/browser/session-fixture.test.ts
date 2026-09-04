import { BrowserSessionClient } from "./session.js";

type Stored = Record<string, string>;

export function sessionHarness(
  type: string,
  options: { lockAvailable?: boolean; prefix?: string; restoreState?: string } = {},
) {
  const { lockAvailable = true, prefix = "id", restoreState = "created" } = options;
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
      if (body.action === "restore") return { state: restoreState };
      return { state: "created", data: { browser_session_id: `${prefix}-server` } };
    },
  });
  return { client, storage, requests };
}
