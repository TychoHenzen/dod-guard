import type { EmbeddedBrowserRuntime } from "../../../index.js";
export function pageRequest(runtime: EmbeddedBrowserRuntime) {
  return runtime.handle({
    method: "GET",
    path: "/",
    headers: { host: "127.0.0.1:4400" },
    body: Buffer.alloc(0),
  });
}

export function sessionRequest(runtime: EmbeddedBrowserRuntime) {
  return apiRequest(runtime, {
    path: "/api/session",
    body: {
      action: "create",
      tab_instance_id: "tab-one",
      document_start: "new",
    },
  });
}

export function statusRequest(
  runtime: EmbeddedBrowserRuntime,
  session: string,
) {
  return apiRequest(runtime, {
    path: "/api/status",
    body: { action: "status" },
    session,
  });
}

function apiRequest(
  runtime: EmbeddedBrowserRuntime,
  options: {
    path: string;
    body: Record<string, unknown>;
    session?: string;
  },
) {
  return runtime.handle({
    method: "POST",
    path: options.path,
    headers: {
      host: "127.0.0.1:4400",
      origin: "http://127.0.0.1:4400",
      "content-type": "application/json",
      "x-code-explorer-tab": "tab-one",
      ...(options.session && { "x-code-explorer-session": options.session }),
    },
    body: Buffer.from(JSON.stringify(options.body)),
  });
}
