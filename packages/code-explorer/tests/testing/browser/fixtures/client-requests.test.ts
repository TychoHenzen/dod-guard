import { replaceGlobal } from "./globals.test.js";

function sessionResponse(rootAccess: string | undefined) {
  const reply = {
      state: rootAccess ? "degraded" : "created",
      data: {
        browser_session_id: "browser-session",
        ...(rootAccess ? { root_access: rootAccess } : {}),
      },
    };
  return { ok: true, json: async () => reply };
}

export function installClientRequests(rootAccess?: string) {
  const requests: Array<{ path: string; options: RequestInit }> = [];
  const restore = replaceGlobal("fetch", async (
    path: string, options: RequestInit,
  ) => {
    requests.push({ path, options });
    if (path === "/api/status" || path === "/api/search")
      return await new Promise<Response>(() => {});
    return sessionResponse(rootAccess);
  });
  return { requests, restore };
}
