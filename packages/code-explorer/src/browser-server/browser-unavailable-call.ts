import type { BrowserCoreReply } from "./browser-core-reply.js";

export function unavailableBrowserCall(): Promise<BrowserCoreReply> {
  return Promise.resolve({
    schema_version: 1,
    code: "workspace_unavailable",
    message: "workspace_unavailable",
    retryable: true,
  });
}
