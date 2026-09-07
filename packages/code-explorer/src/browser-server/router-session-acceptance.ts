import type { BrowserHttpResponse } from "./browser-http-response.js";
import type { BrowserRouterContext } from "./router-context.js";
import { browserError, json } from "./router-policy.js";

export const idleMilliseconds = 30 * 60 * 1000;

export function acceptBrowserSession(
  context: BrowserRouterContext,
  browserSessionId: string,
  session: { lastAcceptedAt: number },
): BrowserHttpResponse | undefined {
  if (context.now() - session.lastAcceptedAt >= idleMilliseconds) {
    context.sessions.delete(browserSessionId);
    return json(410, browserError("browser_session_expired", true));
  }
  session.lastAcceptedAt = context.now();
  return undefined;
}
