import type { BrowserSessionReply } from "./browser-session-reply.js";

export function canRestore(
  navigation: string,
  storedSession: string | null,
  storedTab: string | null,
): boolean {
  return (
    navigation === "reload" && Boolean(storedSession) && Boolean(storedTab)
  );
}

export function isUsableRestore(reply: BrowserSessionReply): boolean {
  return (
    reply.state !== "browser_session_expired" &&
    reply.state !== "invalid_browser_session"
  );
}
