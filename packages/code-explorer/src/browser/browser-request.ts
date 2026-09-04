import type { BrowserReply } from "./browser-reply.js";
import type { BrowserStorage } from "./session.js";

export function ownership(storage: BrowserStorage): Record<string, string> | undefined {
  const session = storage.get("browser_session_id");
  const tab = storage.get("tab_instance_id");
  return session && tab ? { "x-code-explorer-session": session, "x-code-explorer-tab": tab } : undefined;
}

export async function browserRequest(storage: BrowserStorage, path: string, body: Record<string, unknown>) {
  const headers = ownership(storage);
  if (!headers) throw new Error("invalid_browser_session");
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as BrowserReply;
  if (!response.ok) throw new Error(payload.code ?? "workspace_unavailable");
  return payload;
}
