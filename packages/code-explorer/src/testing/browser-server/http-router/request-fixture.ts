import type { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { origin } from "./origin-fixture.js";

const sessionBody = JSON.stringify({
  action: "create",
  tab_instance_id: "tab",
  document_start: "new",
});

function requestBody(body: string | undefined): Buffer {
  return Buffer.from(body ?? sessionBody);
}
export function request(
  router: BrowserHttpRouter,
  input: {
    method?: string;
    path?: string;
    headers?: Record<string, string | undefined>;
    body?: string;
  },
) {
  return router.handle({
    method: input.method ?? "POST",
    path: input.path ?? "/api/session",
    headers: {
      host: "127.0.0.1:4410",
      origin,
      "content-type": "application/json",
      "x-code-explorer-tab": "tab",
      ...input.headers,
    },
    body: requestBody(input.body),
  });
}
