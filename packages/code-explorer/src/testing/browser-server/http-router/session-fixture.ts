import type { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { request } from "./request-fixture.js";
export async function createSession(router: BrowserHttpRouter) {
  const created = await request(router, {});
  return JSON.parse(created.body).data.browser_session_id as string;
}

export function statusRequest(
  router: BrowserHttpRouter,
  session: string,
  tab = "tab",
) {
  return request(router, {
    path: "/api/status",
    body: JSON.stringify({ action: "status" }),
    headers: {
      "x-code-explorer-session": session,
      "x-code-explorer-tab": tab,
    },
  });
}

export function tabRequest(router: BrowserHttpRouter, tab: string) {
  return request(router, {
    body: JSON.stringify({
      action: "create",
      tab_instance_id: tab,
      document_start: "new",
    }),
    headers: { "x-code-explorer-tab": tab },
  });
}
