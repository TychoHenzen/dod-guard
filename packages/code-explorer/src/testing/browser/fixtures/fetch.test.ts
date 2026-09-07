import { replaceGlobal } from "./globals.test.js";

export function captureFetchHeaders() {
  let headers: HeadersInit | undefined;
  const restore = replaceGlobal("fetch", async (
    _path: string, options: RequestInit,
  ) => {
    headers = options.headers;
    return { ok: true, json: async () => ({ state: "ready" }) };
  });
  return { headers: () => headers, restore };
}
